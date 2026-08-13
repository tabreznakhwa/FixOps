# FixOps — current state

Read this first. It exists so a new session does not have to rediscover the app
by exploration. Last updated 11 Aug 2026.

**Live:** https://fixops-nine.vercel.app · repo `tabreznakhwa/FixOps` · Vercel `tabzai/fixops`
**Stack:** Next.js 16 (App Router) · Supabase (Postgres + RLS) · Tailwind · deployed on Vercel.

---

## Open items — start here

| # | Item | Who |
|---|------|-----|
| 1 | `AI_API_KEY` env var (DeepSeek) — Business Insights advisor is built but inert without it | user |
| 2 | `CRON_SECRET` env var — nightly auto-absent job will not run without it | user |
| 3 | R22 (ITM00021) selling price is **0** — ~KWD 1,000 of gas fitted unbilled per 6 weeks. Largest recurring loss found | user |
| 4 | Backfill historical stock issues from `work_order_line_items` into `inventory_transactions` — agreed in principle, not built | agent |
| 5 | Check for stock left behind by cancelled purchase invoices (query in "Inventory ledger" below) | user then agent |

Migrations **028, 029, 030 have been run.** Physical stock count applied 11 Aug
(26 of 27 items exact).

---

## Non-obvious rules — these were expensive to learn

### Navigation
Back destination = **where the user came from**, never what the record relates to.
Origin travels as `return_to` / `work_order_id` / `complaint_id` URL params.
`resolveBack()` in `src/lib/backNav.ts` returns href **and** label together so a
button cannot name one destination and navigate to another. `BackButton` never
consults history — every module renders inside an iframe with a patched history
API (`TabModeGuard` + `IFRAME_GUARD` in `(dashboard)/layout.tsx`), so the stack is
meaningless. After a successful submit use `router.replace()`, never `push()` or
`window.location.href`, or the completed form stays in the stack.

### Supabase row limits
PostgREST caps a response at 1000 rows regardless of `.limit()`. This silently
truncated the customer dropdown (1,058 customers, everyone after "Z" invisible)
and the attendance list. Use `fetchAllCustomers()` in `src/lib/customers.ts`, or
page with `.range()`. **Never trust a bare `.limit(5000)`.**

### Inventory ledger
Three ways stock moves; all three must write to `inventory_transactions`:
1. Purchase invoice received — always did
2. Part issued to a job — **was missing until 11 Aug**
3. Manual stock adjustment — **was missing until 11 Aug**

Cancelling a purchase invoice used to leave the stock on the books. It now
reverses and writes a reversal row, refusing if the goods were already fitted.

Because issues were never logged before 11 Aug, **`inventory_transactions`
under-reports consumption for anything earlier** — Stock Trial shows 0 issued for
July. The Parts Used report (`/inventory/parts-used`) is built on
`work_order_line_items` instead, which is complete, and is the reliable source
for any historical usage question.

Find stock nothing can explain:
```sql
SELECT i.item_code, i.item_name, i.current_stock,
       COALESCE(rec.received,0) AS received, COALESCE(iss.issued,0) AS issued,
       i.current_stock - (COALESCE(rec.received,0) - COALESCE(iss.issued,0)) AS unexplained
FROM inventory_items i
LEFT JOIN (SELECT item_id, SUM(CASE WHEN transaction_type IN ('purchase','returned','adjustment')
             THEN quantity ELSE -quantity END) received
           FROM inventory_transactions GROUP BY item_id) rec ON rec.item_id = i.id
LEFT JOIN (SELECT inventory_item_id item_id, SUM(quantity) issued
           FROM work_order_line_items
           WHERE item_type='part' AND inventory_item_id IS NOT NULL
           GROUP BY inventory_item_id) iss ON iss.item_id = i.id
WHERE i.is_active
ORDER BY ABS(i.current_stock - (COALESCE(rec.received,0) - COALESCE(iss.issued,0))) DESC;
```
Adjust it after the backfill — issues will then be in the ledger and would be
double-counted.

Stock left behind by cancelled invoices:
```sql
SELECT pi.invoice_number, pi.invoice_date, i.item_code, i.item_name, pii.quantity
FROM purchase_invoices pi
JOIN purchase_invoice_items pii ON pii.purchase_invoice_id = pi.id
JOIN inventory_items i ON i.id = pii.inventory_item_id
WHERE pi.status = 'cancelled' ORDER BY pi.invoice_date DESC;
```

### Attendance & payroll
Not clocking in creates **no row at all** — absence only exists if written. A
nightly job (`/api/attendance/auto-absent`, Vercel cron 00:00 UTC = 03:00 Kuwait)
now writes them, skipping Fridays, public holidays, anyone already recorded and
anyone not yet joined. Friday/holiday OT is paid to **everyone**;
`overtime_eligible` gates only ordinary weekday OT. `salary_runs` is
`UNIQUE(org, month, year)` — one run per month, which is why leave settlement is
paid as an advance (`staff.advance_balance` auto-recovers at month end) rather
than an off-cycle run.

### Audit logging
`logAudit()` swallows all errors by design. It wrote to columns that did not
exist, so **nothing was ever logged** until migration 030. If audit rows stop
appearing, suspect a schema mismatch, not the caller.

---

## Testing

Suites live in the session scratchpad (not the repo) and cover the pure logic:
business metrics, customer paging, leave settlement, auto-absent, back-nav,
Friday rotation, vendor ledger. Run with
`npx tsx --tsconfig tsconfig.json <file>` **from the project root** — the path
alias breaks otherwise. Anything money- or stock-related should get a test before
it ships.

## Verifying UI changes

The user's Chrome is signed in and reachable through the claude-in-chrome tools.
Append `?__tab=1` to load a page outside the tab shell. **Verify changes there
rather than asking the user to check** — several bugs in this app looked fixed and
were not. Never click anything that writes money or deletes data.
