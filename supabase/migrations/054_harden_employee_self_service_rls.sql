-- Harden direct authenticated reads for employee self-service data.
--
-- Next.js pages and APIs already bind attendance_kiosk/technician access to the
-- active staff row linked through staff.user_id. Those application checks do
-- not protect a direct PostgREST request made with the user's Supabase token,
-- so RLS must enforce the same ownership boundary.
--
-- Owner/admin/manager/hr/accounts retain organization-wide reads needed by the
-- back-office application. Technician and attendance-kiosk users can read only
-- their own staff, attendance and salary records. Other roles receive no direct
-- access to these HR/payroll tables. Server-side service-role queries continue
-- to bypass RLS and must keep their explicit tenant/role/ownership checks.

alter table public.staff enable row level security;
alter table public.attendance enable row level security;
alter table public.salary_runs enable row level security;
alter table public.salary_slips enable row level security;

-- These application paths write through createAdminClient after performing
-- authorization. Reset inherited/public and direct browser grants, then restore
-- read-only authenticated access. Production previously had broad anon grants
-- on staff and payroll tables, so revoking only mutation privileges is not
-- sufficient.
revoke all privileges on table public.staff from public;
revoke all privileges on table public.staff from anon;
revoke all privileges on table public.staff from authenticated;

revoke all privileges on table public.attendance from public;
revoke all privileges on table public.attendance from anon;
revoke all privileges on table public.attendance from authenticated;

revoke all privileges on table public.salary_runs from public;
revoke all privileges on table public.salary_runs from anon;
revoke all privileges on table public.salary_runs from authenticated;

revoke all privileges on table public.salary_slips from public;
revoke all privileges on table public.salary_slips from anon;
revoke all privileges on table public.salary_slips from authenticated;

grant select on table public.staff to authenticated;
grant select on table public.attendance to authenticated;
grant select on table public.salary_runs to authenticated;
grant select on table public.salary_slips to authenticated;

grant select, insert, update, delete on public.staff to service_role;
grant select, insert, update, delete on public.attendance to service_role;
grant select, insert, update, delete on public.salary_runs to service_role;
grant select, insert, update, delete on public.salary_slips to service_role;

-- Replace the broad FOR ALL policies from the initial schema.
drop policy if exists "staff_org" on public.staff;
drop policy if exists "staff_select_privileged_or_self" on public.staff;

create policy "staff_select_privileged_or_self"
  on public.staff
  for select
  using (
    is_user_active()
    and organization_id = get_user_organization_id()
    and (
      get_user_role() in ('owner', 'admin', 'manager', 'hr', 'accounts')
      or (
        get_user_role() in ('technician', 'attendance_kiosk')
        and user_id = auth.uid()
        and employment_status = 'active'
      )
    )
  );

drop policy if exists "attendance_org" on public.attendance;
-- This legacy organization-wide policy exists in production even though it is
-- absent from the checked-in migration history. Permissive policies are ORed,
-- so leaving it in place would defeat the own-row policy below.
drop policy if exists "org_isolation" on public.attendance;
drop policy if exists "attendance_select_privileged_or_self" on public.attendance;

create policy "attendance_select_privileged_or_self"
  on public.attendance
  for select
  using (
    is_user_active()
    and organization_id = get_user_organization_id()
    and (
      get_user_role() in ('owner', 'admin', 'manager', 'hr', 'accounts')
      or (
        get_user_role() in ('technician', 'attendance_kiosk')
        and exists (
          select 1
          from public.staff own_staff
          where own_staff.id = attendance.staff_id
            and own_staff.organization_id = attendance.organization_id
            and own_staff.user_id = auth.uid()
            and own_staff.employment_status = 'active'
        )
      )
    )
  );

-- A salary run contains organization-wide totals, so self-service users do not
-- receive direct run rows. Their supported pages read run labels through an
-- explicitly authorized server-side service-role query.
drop policy if exists "salary_runs_org" on public.salary_runs;
drop policy if exists "salary_runs_select_privileged" on public.salary_runs;

create policy "salary_runs_select_privileged"
  on public.salary_runs
  for select
  using (
    is_user_active()
    and organization_id = get_user_organization_id()
    and get_user_role() in ('owner', 'admin', 'manager', 'hr', 'accounts')
  );

drop policy if exists "salary_slips_org" on public.salary_slips;
drop policy if exists "salary_slips_select_privileged_or_self" on public.salary_slips;

create policy "salary_slips_select_privileged_or_self"
  on public.salary_slips
  for select
  using (
    is_user_active()
    and organization_id = get_user_organization_id()
    and (
      get_user_role() in ('owner', 'admin', 'manager', 'hr', 'accounts')
      or (
        get_user_role() in ('technician', 'attendance_kiosk')
        and exists (
          select 1
          from public.staff own_staff
          where own_staff.id = salary_slips.staff_id
            and own_staff.organization_id = salary_slips.organization_id
            and own_staff.user_id = auth.uid()
            and own_staff.employment_status = 'active'
        )
      )
    )
  );
