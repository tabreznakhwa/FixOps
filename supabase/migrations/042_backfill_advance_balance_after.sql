-- Migration 041 added salary_slips.advance_balance_after (the advance balance
-- frozen as of that slip's own deduction) but backfilled only two slips, for
-- EMP00016. Every other historical slip kept advance_balance_after = NULL, and
-- the payslip page fell back to the LIVE staff.advance_balance for those — so
-- every past payslip printed today's figure. A loan repaid monthly appeared to
-- never go down: Dinesh Poojary's July, August and September slips all read
-- 200 although 50 was recovered each month, when the truth is 300, 250, 200.
--
-- The page no longer falls back to the live balance. This migration recovers
-- the real historical values.
--
-- METHOD — forward reconstruction from first principles, per slip:
--
--   balance_after = opening_advance + opening_loan
--                 + advances issued   on/before that run's processed_at
--                 - cash repayments   on/before that run's processed_at
--                 - payroll deductions for that run and every earlier run
--
-- An earlier draft walked the chain backwards from the newest slip. That was
-- wrong: it silently ignored advances issued, and cash repaid, between two
-- runs. Sher Ali Shaikh (40 repaid) and Rafique Mohimtuley (100 repaid) would
-- both have been given understated August balances. Reconstructing forwards
-- from the ledger handles those, because the dates decide what had happened by
-- the time each run was processed.
--
-- The formula is the same one that reconciles every employee's CURRENT balance
-- exactly — verified against all 12 staff with advance activity — so it is not
-- a guess about how the balance is derived.
--
-- Only fills NULLs: values frozen correctly at processing time (September, and
-- EMP00016's hand-corrected slips) are never overwritten, and re-running is
-- harmless. Run the verification query at the bottom FIRST — it checks this
-- formula against the slips that already carry a known-good value.

with slip_periods as (
  select
    ss.id,
    ss.staff_id,
    ss.advance_deduction,
    sr.salary_year * 12 + sr.salary_month as period,
    sr.processed_at::date                 as processed_on
  from salary_slips ss
  join salary_runs sr on sr.id = ss.salary_run_id
),
computed as (
  select
    sp.id,
    coalesce(s.opening_advance, 0) + coalesce(s.opening_loan, 0)
      + coalesce((
          select sum(sa.amount) from staff_advances sa
          where sa.staff_id = sp.staff_id and sa.issued_date <= sp.processed_on
        ), 0)
      - coalesce((
          select sum(r.amount) from staff_advance_repayments r
          where r.staff_id = sp.staff_id and r.repayment_date <= sp.processed_on
        ), 0)
      - coalesce((
          select sum(earlier.advance_deduction) from slip_periods earlier
          where earlier.staff_id = sp.staff_id and earlier.period <= sp.period
        ), 0) as balance_after
  from slip_periods sp
  join staff s on s.id = sp.staff_id
)
update salary_slips ss
set advance_balance_after = greatest(0, c.balance_after)
from computed c
where c.id = ss.id
  and ss.advance_balance_after is null;


-- ── VERIFICATION — run this BEFORE the update above ────────────────────────
-- Recomputes the formula for slips that ALREADY hold a trusted frozen value
-- (September 2026, and EMP00016's corrected July/August). Every row should show
-- matches = true. If any row differs, do not run the update — the ledger holds
-- something this formula does not model.
--
-- with slip_periods as (
--   select ss.id, ss.staff_id, ss.advance_deduction, ss.advance_balance_after,
--          sr.salary_year * 12 + sr.salary_month as period,
--          sr.processed_at::date as processed_on
--   from salary_slips ss join salary_runs sr on sr.id = ss.salary_run_id
-- )
-- select s.full_name, sp.period, sp.advance_balance_after as stored,
--   greatest(0,
--     coalesce(s.opening_advance,0) + coalesce(s.opening_loan,0)
--     + coalesce((select sum(sa.amount) from staff_advances sa
--         where sa.staff_id = sp.staff_id and sa.issued_date <= sp.processed_on), 0)
--     - coalesce((select sum(r.amount) from staff_advance_repayments r
--         where r.staff_id = sp.staff_id and r.repayment_date <= sp.processed_on), 0)
--     - coalesce((select sum(e.advance_deduction) from slip_periods e
--         where e.staff_id = sp.staff_id and e.period <= sp.period), 0)
--   ) as recomputed,
--   abs(sp.advance_balance_after - greatest(0,
--     coalesce(s.opening_advance,0) + coalesce(s.opening_loan,0)
--     + coalesce((select sum(sa.amount) from staff_advances sa
--         where sa.staff_id = sp.staff_id and sa.issued_date <= sp.processed_on), 0)
--     - coalesce((select sum(r.amount) from staff_advance_repayments r
--         where r.staff_id = sp.staff_id and r.repayment_date <= sp.processed_on), 0)
--     - coalesce((select sum(e.advance_deduction) from slip_periods e
--         where e.staff_id = sp.staff_id and e.period <= sp.period), 0)
--   )) < 0.01 as matches
-- from slip_periods sp join staff s on s.id = sp.staff_id
-- where sp.advance_balance_after is not null
-- order by s.full_name, sp.period;
