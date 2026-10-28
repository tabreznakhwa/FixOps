-- ============================================================================
-- 064_staff_employment_status_enum.sql
-- Fixes staff profile edits assigning JSON text directly to the
-- public.employment_status enum. Keep the opening-balance update atomic and
-- reject invalid statuses before casting.
-- ============================================================================

begin;

create or replace function public.update_staff_profile_with_opening_balance(
  p_org_id uuid,
  p_updated_by uuid,
  p_staff_id uuid,
  p_expected_opening_advance numeric,
  p_expected_opening_loan numeric,
  p_updates jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff public.staff%rowtype;
  v_opening_advance numeric;
  v_opening_loan numeric;
  v_balance numeric;
  v_employment_status text;
begin
  if p_org_id is null or p_updated_by is null or p_staff_id is null
     or p_expected_opening_advance is null or p_expected_opening_loan is null
     or jsonb_typeof(p_updates) is distinct from 'object' then
    raise exception 'Invalid staff update';
  end if;
  if not exists (
    select 1
    from public.users
    where id = p_updated_by
      and organization_id = p_org_id
      and status = 'active'
      and role in ('owner', 'admin', 'hr', 'manager')
  ) then
    raise exception 'Forbidden';
  end if;

  select * into v_staff
  from public.staff
  where id = p_staff_id
    and organization_id = p_org_id
  for update;

  if not found then
    raise exception 'Employee not found';
  end if;
  if abs(coalesce(v_staff.opening_advance, 0) - p_expected_opening_advance) > 0.001
     or abs(coalesce(v_staff.opening_loan, 0) - p_expected_opening_loan) > 0.001 then
    raise exception 'The employee opening balance changed. Reload and try again.';
  end if;

  v_opening_advance := coalesce((p_updates->>'opening_advance')::numeric, 0);
  v_opening_loan := coalesce((p_updates->>'opening_loan')::numeric, 0);
  if v_opening_advance < 0 or v_opening_loan < 0 then
    raise exception 'Opening advance and loan cannot be negative';
  end if;

  v_employment_status := p_updates->>'employment_status';
  if v_employment_status is null or v_employment_status not in (
    'active', 'on_leave', 'terminated', 'resigned'
  ) then
    raise exception 'Invalid employment status';
  end if;

  v_balance := greatest(
    0,
    coalesce(v_staff.advance_balance, 0)
      + v_opening_advance - coalesce(v_staff.opening_advance, 0)
      + v_opening_loan - coalesce(v_staff.opening_loan, 0)
  );

  update public.staff
  set full_name = p_updates->>'full_name',
      designation = nullif(p_updates->>'designation', ''),
      department = nullif(p_updates->>'department', ''),
      mobile_number = nullif(p_updates->>'mobile_number', ''),
      email = nullif(p_updates->>'email', ''),
      nationality = nullif(p_updates->>'nationality', ''),
      passport_number = nullif(p_updates->>'passport_number', ''),
      visa_number = nullif(p_updates->>'visa_number', ''),
      emirates_id = nullif(p_updates->>'emirates_id', ''),
      visa_expiry_date = nullif(p_updates->>'visa_expiry_date', '')::date,
      passport_expiry_date = nullif(p_updates->>'passport_expiry_date', '')::date,
      basic_salary = coalesce((p_updates->>'basic_salary')::numeric, 0),
      housing_allowance = 0,
      transport_allowance = 0,
      food_allowance = coalesce((p_updates->>'food_allowance')::numeric, 0),
      other_allowance = coalesce((p_updates->>'other_allowance')::numeric, 0),
      allowance_name = coalesce(nullif(btrim(p_updates->>'allowance_name'), ''), 'Allowance'),
      fixed_overtime_monthly = coalesce((p_updates->>'fixed_overtime_monthly')::numeric, 0),
      friday_ot_amount = coalesce((p_updates->>'friday_ot_amount')::numeric, 0),
      opening_advance = v_opening_advance,
      opening_loan = v_opening_loan,
      advance_balance = v_balance,
      overtime_eligible = coalesce((p_updates->>'overtime_eligible')::boolean, false),
      bank_name = nullif(p_updates->>'bank_name', ''),
      iban = nullif(p_updates->>'iban', ''),
      employment_status = v_employment_status::public.employment_status,
      notes = nullif(p_updates->>'notes', '')
  where id = p_staff_id
    and organization_id = p_org_id;
end;
$$;

revoke all on function public.update_staff_profile_with_opening_balance(uuid, uuid, uuid, numeric, numeric, jsonb) from public;
revoke all on function public.update_staff_profile_with_opening_balance(uuid, uuid, uuid, numeric, numeric, jsonb) from anon;
revoke all on function public.update_staff_profile_with_opening_balance(uuid, uuid, uuid, numeric, numeric, jsonb) from authenticated;
grant execute on function public.update_staff_profile_with_opening_balance(uuid, uuid, uuid, numeric, numeric, jsonb)
  to service_role;

commit;
