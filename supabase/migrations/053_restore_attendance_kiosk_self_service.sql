-- Restore employee self-service for attendance_kiosk logins that are linked to
-- an active staff record. Application APIs still bind every operation to
-- staff.user_id and organization_id; this migration removes the older role-only
-- exclusions from leave reads and transactional submission.

alter table public.leave_applications enable row level security;

-- Self-service lookups require one unambiguous staff identity per login. The
-- partial index keeps unlinked staff rows unrestricted.
create unique index if not exists idx_staff_org_user_id_unique
  on public.staff(organization_id, user_id)
  where user_id is not null;

drop policy if exists "leave_applications_select_own_or_reviewer"
  on public.leave_applications;

create policy "leave_applications_select_own_or_reviewer"
  on public.leave_applications
  for select using (
    is_user_active()
    and organization_id = get_user_organization_id()
    and (
      staff_id in (
        select id
        from public.staff
        where user_id = auth.uid()
          and organization_id = get_user_organization_id()
          and employment_status = 'active'
      )
      or get_user_role() in ('owner', 'admin')
    )
  );

create or replace function public.submit_leave_application(
  p_org_id uuid,
  p_staff_id uuid,
  p_submitter_id uuid,
  p_leave_type text,
  p_start_date date,
  p_end_date date,
  p_reason text,
  p_idempotency_key text default null
)
returns table(
  application public.leave_applications,
  created boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.leave_applications%rowtype;
  v_staff public.staff%rowtype;
  v_dates date[];
  v_reason text := btrim(p_reason);
  v_key text := nullif(btrim(p_idempotency_key), '');
begin
  if p_org_id is null or p_staff_id is null or p_submitter_id is null then
    raise exception 'Unauthorized';
  end if;
  if p_leave_type is null
     or p_leave_type not in ('annual_leave', 'sick_leave', 'compensation_leave') then
    raise exception 'Select a valid leave type';
  end if;
  if p_start_date is null or p_end_date is null then
    raise exception 'Start and end dates are required';
  end if;
  if p_end_date < p_start_date then
    raise exception 'End date cannot be before start date';
  end if;
  if p_end_date - p_start_date > 365 then
    raise exception 'A leave application cannot span more than 366 calendar days';
  end if;
  if v_reason is null or char_length(v_reason) not between 3 and 1000 then
    raise exception 'Reason must be between 3 and 1,000 characters';
  end if;
  if v_key is not null and char_length(v_key) > 200 then
    raise exception 'Invalid request key';
  end if;

  if not exists (
    select 1
    from public.users
    where id = p_submitter_id
      and organization_id = p_org_id
      and status = 'active'
  ) then
    raise exception 'Unauthorized';
  end if;

  -- Return a committed retry before applying validations that can change with
  -- time or calendar state.
  if v_key is not null then
    select * into v_request
    from public.leave_applications
    where organization_id = p_org_id
      and staff_id = p_staff_id
      and idempotency_key = v_key;

    if found then
      if v_request.leave_type <> p_leave_type
         or v_request.start_date <> p_start_date
         or v_request.end_date <> p_end_date
         or v_request.reason <> v_reason then
        raise exception 'This request key was already used for a different leave application';
      end if;
      return query select v_request, false;
      return;
    end if;
  end if;

  if p_start_date < (now() at time zone 'Asia/Kuwait')::date then
    raise exception 'Leave applications cannot start in the past';
  end if;

  -- Every leave/payroll path takes month locks before staff or attendance locks.
  -- Revalidate employment after the lock because payroll can be waiting on the
  -- same employee row in the opposite direction otherwise.
  perform public.lock_leave_payroll_months(p_org_id, p_start_date, p_end_date);

  -- Attendance is always locked before staff in leave/payroll workflows. This
  -- matches normal attendance writes, whose FK checks reach staff afterwards.
  lock table public.attendance in share row exclusive mode;

  select * into v_staff
  from public.staff
  where id = p_staff_id
    and organization_id = p_org_id
    and user_id = p_submitter_id
    and employment_status = 'active'
  for update;

  if not found then
    raise exception 'Your login is not linked to an active staff profile';
  end if;
  if p_start_date < v_staff.joining_date then
    raise exception 'Leave cannot begin before your joining date (%)', v_staff.joining_date;
  end if;

  select coalesce(array_agg(day::date order by day), array[]::date[])
  into v_dates
  from generate_series(p_start_date, p_end_date, interval '1 day') as day
  where extract(isodow from day) <> 5
    and not exists (
      select 1
      from public.attendance holiday
      where holiday.organization_id = p_org_id
        and holiday.date = day::date
        and holiday.is_public_holiday
    );

  if cardinality(v_dates) < 1 then
    raise exception 'The selected range contains no working days';
  end if;

  if exists (
    select 1
    from unnest(v_dates) as working_date
    join public.salary_runs run
      on run.organization_id = p_org_id
     and run.salary_year = extract(year from working_date)::integer
     and run.salary_month = extract(month from working_date)::integer
  ) then
    raise exception 'Payroll has already been processed for part of this leave period';
  end if;

  insert into public.leave_applications (
    organization_id,
    staff_id,
    leave_type,
    start_date,
    end_date,
    requested_days,
    reason,
    submitted_by,
    idempotency_key
  ) values (
    p_org_id,
    p_staff_id,
    p_leave_type,
    p_start_date,
    p_end_date,
    cardinality(v_dates),
    v_reason,
    p_submitter_id,
    v_key
  )
  returning * into v_request;

  return query select v_request, true;
  return;
exception
  when unique_violation then
    if v_key is null then
      raise;
    end if;

    select * into v_request
    from public.leave_applications
    where organization_id = p_org_id
      and staff_id = p_staff_id
      and idempotency_key = v_key;

    if not found then
      raise;
    end if;
    if v_request.leave_type <> p_leave_type
       or v_request.start_date <> p_start_date
       or v_request.end_date <> p_end_date
       or v_request.reason <> v_reason then
      raise exception 'This request key was already used for a different leave application';
    end if;
    return query select v_request, false;
    return;
end;
$$;

revoke all on function public.submit_leave_application(
  uuid, uuid, uuid, text, date, date, text, text
) from public;
revoke all on function public.submit_leave_application(
  uuid, uuid, uuid, text, date, date, text, text
) from anon;
revoke all on function public.submit_leave_application(
  uuid, uuid, uuid, text, date, date, text, text
) from authenticated;
grant execute on function public.submit_leave_application(
  uuid, uuid, uuid, text, date, date, text, text
) to service_role;
