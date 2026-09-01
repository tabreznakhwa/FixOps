-- Payslip page (payroll/slips/[runId]/[staffId]/page.tsx) showed "Advance
-- balance remaining" by live-fetching staff.advance_balance at print time,
-- instead of freezing what the balance actually was right after THAT
-- month's own deduction. So every past payslip retroactively changed its
-- displayed remaining balance whenever a later month's payroll (or a direct
-- repayment) moved the live balance — exactly what was reported: July's
-- payslip for Sadique Mohimtule (EMP00016) showed "130" (August's current
-- balance) instead of the "205" that was actually true right after July's
-- own deduction.
--
-- Fix: freeze the balance at processing time, same "logged" pattern already
-- used for inventory stock and staff advance repayments this session.
alter table salary_slips add column if not exists advance_balance_after numeric;

-- One-time correction for the two slips already shown to be wrong.
-- August's slip: nothing has changed staff.advance_balance since it was
-- processed, so the current live balance IS its correct frozen value.
update salary_slips ss
set advance_balance_after = s.advance_balance
from staff s, salary_runs sr
where ss.staff_id = s.id and ss.salary_run_id = sr.id
  and s.staff_code = 'EMP00016' and sr.salary_month = 8 and sr.salary_year = 2026;

-- July's slip: its balance_after is recoverable exactly as August's frozen
-- balance plus August's own deduction (undoing August's deduction lands
-- back where July's processing actually left the balance).
update salary_slips ss_july
set advance_balance_after = ss_aug.advance_balance_after + ss_aug.advance_deduction
from salary_slips ss_aug, staff s, salary_runs sr_july, salary_runs sr_aug
where ss_july.staff_id = s.id and ss_july.salary_run_id = sr_july.id
  and ss_aug.staff_id = s.id and ss_aug.salary_run_id = sr_aug.id
  and s.staff_code = 'EMP00016'
  and sr_july.salary_month = 7 and sr_july.salary_year = 2026
  and sr_aug.salary_month = 8 and sr_aug.salary_year = 2026;
