-- Migration 041 added salary_slips.advance_balance_after (the advance balance
-- frozen as of that slip's own deduction) but only backfilled two slips, for
-- EMP00016. Every other historical slip kept advance_balance_after = NULL, and
-- the payslip page fell back to the LIVE staff.advance_balance for those — so
-- every past payslip printed today's balance. A loan being repaid monthly
-- therefore showed the same remaining balance on every single payslip, which is
-- what was reported: Dinesh Poojary's July, August and September slips all read
-- 200 although 50 was recovered each month.
--
-- The page no longer falls back to the live balance (it omits an unknown
-- balance instead). This migration recovers the real historical values.
--
-- Method: walk backwards. Undoing a month's own deduction lands on the balance
-- as it stood after the previous month:
--     after(N) = after(N+1) + deduction(N+1)
-- September 2026 was processed after migration 041 and so already carries a
-- correct frozen value; it anchors the chain.
--
-- ASSUMPTION — verify before running: no new advance or loan was ISSUED between
-- two consecutive payroll runs. Issuing one raises staff.advance_balance outside
-- this chain, which would make the walk overstate the earlier months. Check with:
--
--   select s.full_name, sa.type, sa.amount, sa.issued_date
--   from staff_advances sa join staff s on s.id = sa.staff_id
--   where sa.issued_date >= '2026-07-01'
--   order by s.full_name, sa.issued_date;
--
-- If that returns rows inside the payroll window, fix those employees by hand
-- instead of trusting the walk for them.
--
-- Only fills NULLs, so it never overwrites a value that was frozen correctly at
-- processing time (including EMP00016's hand-corrected slips). Re-running it is
-- harmless.

do $$
declare
  touched integer;
begin
  -- One pass per month-step backwards; 24 covers two years of history.
  for i in 1..24 loop
    update salary_slips ss
    set advance_balance_after = nxt.advance_balance_after + nxt.advance_deduction
    from salary_slips nxt
    join salary_runs sr_nxt on sr_nxt.id = nxt.salary_run_id
    join salary_runs sr_cur on true
    where ss.advance_balance_after is null
      and ss.salary_run_id = sr_cur.id
      and nxt.staff_id = ss.staff_id
      and nxt.advance_balance_after is not null
      and (sr_nxt.salary_year * 12 + sr_nxt.salary_month)
        = (sr_cur.salary_year * 12 + sr_cur.salary_month) + 1;

    get diagnostics touched = row_count;
    exit when touched = 0;
  end loop;
end $$;

-- Anything still NULL has no later slip to walk back from — report it rather
-- than guessing. These will simply show no remaining-balance line.
-- select s.full_name, sr.salary_year, sr.salary_month
-- from salary_slips ss
-- join salary_runs sr on sr.id = ss.salary_run_id
-- join staff s on s.id = ss.staff_id
-- where ss.advance_balance_after is null and ss.advance_deduction > 0;
