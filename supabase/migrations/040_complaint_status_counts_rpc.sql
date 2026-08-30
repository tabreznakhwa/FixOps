-- Dashboard's "Complaint Breakdown" pie chart built its counts by fetching
-- every non-cancelled complaint row into JS (`.select('status')`, no
-- .range()/.limit()) and counting client-side. PostgREST caps a single
-- response at 1000 rows regardless of the query (see docs/PROJECT-STATE.md,
-- "Supabase row limits") — once the org passed 1000 non-cancelled
-- complaints, the chart silently saw only the first 1000 (oldest-first by
-- default order), which were overwhelmingly 'completed', so it looked
-- permanently stuck at "1000 active complaints / 100% Completed" no matter
-- how many new complaints came in afterward. Same root cause as the
-- customer-dropdown truncation that motivated fetchAllCustomers().
--
-- Fix: aggregate server-side instead of shipping every row to the client.
-- GROUP BY collapses the result to one row per status (14 possible values),
-- which can never hit the 1000-row cap no matter how many complaints exist.
-- Plain SQL function, default SECURITY INVOKER, so the existing
-- "complaints_org_isolation" RLS policy still scopes it to the caller's org
-- exactly as the old .select() did — no org id parameter needed.
create or replace function get_complaint_status_counts()
returns table(status text, count bigint) as $$
  select status::text, count(*)
  from complaints
  where status <> 'cancelled'
  group by status;
$$ language sql stable;

grant execute on function get_complaint_status_counts() to authenticated, service_role;
