-- Add "sick leave" as a paid absence status alongside present/absent/half_day/leave.
--
-- Sick leave is a statutory entitlement capped at 15 days per calendar year.
-- The cap is enforced as a *warning* in the UI (never a hard block), so the DB
-- only needs to admit the new status value — no balance column is required.
--
-- Migration 008 declared the check inline, so Postgres auto-named it
-- `attendance_status_check`. Drop it and re-add with the extra value.
alter table attendance drop constraint if exists attendance_status_check;
alter table attendance add constraint attendance_status_check
  check (status in ('present', 'absent', 'half_day', 'leave', 'sick_leave'));
