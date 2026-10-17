# FixOps — current state

Read this first. It exists so a new session does not have to rediscover the app
by exploration. Last updated 17 Oct 2026.

**Note:** commits `fccbb1d`…`2ca13b6` (Pay Salaries modal portal/zoom fixes, a
Vercel function-invocation-spike fix replacing `force-dynamic` with ISR
`revalidate=60` + a `get_complaint_status_counts` RPC, and a second inventory
reconciliation dated 2 Sept) landed on `main` after this doc's previous
11 Aug update, from a session that didn't write its own state back here. Their
substance was not re-verified before this edit — treat that stretch of history
as real (it's on `main`) but undocumented, and reconcile properly if it matters
to what you're doing.

**Live:** https://fixops-nine.vercel.app · repo `tabreznakhwa/FixOps` · Vercel `tabzai/fixops`
**Stack:** Next.js 16 (App Router) · Supabase (Postgres + RLS) · Tailwind · deployed on Vercel.

---

## Open items — start here

| # | Item | Who |
|---|------|-----|
| 1 | `AI_API_KEY` env var (DeepSeek) — Business Insights advisor is built but inert without it | user |
| 2 | R22 (ITM00021) selling price is **0** — ~KWD 1,000 of gas fitted unbilled per 6 weeks. Largest recurring loss found | user |
| 3 | Backfill historical stock issues from `work_order_line_items` into `inventory_transactions` — agreed in principle, not built | agent |
| 4 | Check for stock left behind by cancelled purchase invoices (query in "Inventory ledger" below) | user then agent |

`CRON_SECRET` was set in Vercel 9 Sept 2026 — the nightly auto-absent job
(00:00 UTC / 3am Kuwait) should now actually authenticate and run. It hadn't
been set before this, which is why staff who didn't clock in (e.g. Farhan
Dalvi, 8 Sept) were never auto-marked absent — every cron call 401'd silently.
**Verify it's really running**: check `/attendance` a day or two out; if
unmarked absences from the day before appear without anyone clicking "Mark all
absent" by hand, it worked. If not, re-check the env var is on the Production
environment and that a redeploy happened after it was added.

Migrations **028, 029, 030, 046 and 047 have been run.** Migration 047 was
applied directly through the Supabase Management API on 12 Oct 2026 and only
version 047 was added to `supabase_migrations.schema_migrations`; the older
001–046 history is still incomplete. Migrations 048, 049 and 050 were manually
applied by the user on 13 Oct 2026, and their physical schema/function effects
were verified that day. Their migration-history entries were not verified;
migration 048 was already known to be absent from history. Do not run
`db push --include-all` just to make the histories match — it would replay
already-applied DDL.

Migration 051 was manually applied by the user on 14 Oct 2026. Migrations
052 (company asset register), 053 (kiosk self-service restoration), and 054
(employee self-service RLS hardening) were manually applied by the user on
14 Oct 2026. Migration 052's and 053's production effects have not yet been
independently verified. Migration 054 needs to be rerun from its latest file:
the first run happened before the legacy `attendance.org_isolation` policy and
broad production table grants were discovered and added to the migration.
Migrations 055 (`055_accounting_posting_lifecycle.sql`) and 056
(`056_unpaid_annual_leave_payroll.sql`) were manually applied by the user on
17 Oct 2026; their production effects have not yet been independently verified.
Migration 055 introduces the canonical AR/AP posting journal and transactional
accounting RPCs required by the corresponding application routes. Migration 056
introduces unpaid approved annual leave, freezes annual-leave days/deduction on
new salary slips, preserves existing processed/paid history as an explicit paid
snapshot, and converts only safe unprocessed historical annual-leave dates.
Deploy the compatible application only after verifying both migrations' schema,
function, grant and reconciliation checks.
Migration
051's two unique indexes and five
`SECURITY DEFINER` functions were verified in production;
`service_role` alone has execute access to those functions. It restores the
unique attendance key `(organization_id, staff_id, date)` required by leave
approval's `ON CONFLICT`, enforces one salary slip per employee/run, corrects
payroll allowance itemization, requires complete working-day attendance before
payroll, makes payroll payment/reset safer, makes leave settlement atomic with
payroll, and applies staff opening-balance edits under a row lock. Its migration-
history entry was not verified; do not use `db push --include-all` to reconcile
history.
Physical stock
count applied 11 Aug (26 of 27 items exact); a further reconciliation is dated
2 Sept per commit `62f7e5d` (see note above — not independently re-verified here).

---

## Non-obvious rules — these were expensive to learn

### Navigation
Back destination = **where the user came from**, never what the record relates to.
Origin travels as `return_to` / `work_order_id` / `complaint_id` URL params.
`resolveBack()` in `src/lib/backNav.ts` returns href **and** label together so a
button cannot name one destination and navigate to another. `BackButton` never
consults history — two coexisting mechanisms, distinguished by what's being
opened, both bypass the browser's shared history stack entirely:

- **Formal documents** (invoices, work orders, complaints, quotations,
  purchase invoices, purchase orders, payslips) each open in their own OS
  popup window via `DocumentLink` (`src/components/ui/DocumentLink.tsx`,
  `window.open()` keyed by a stable `tabKey` so reopening the same document
  focuses one window instead of stacking more). The popup's own page renders
  without the sidebar via a `?__popup=1` flag threaded through `proxy.ts` →
  `x-popup-mode` header → `(dashboard)/layout.tsx`, whose injected script
  keeps that flag on subsequent client-side navigations inside the same
  popup.
- **Main-module sidebar navigation** (Dashboard, Complaints, Work Orders,
  Customers, Quotations, etc.) opens as an in-app tab: `TabContext`/
  `tabState.ts` dedupes tabs by `tabKey` in React state, and `TabShell`
  renders each as an always-mounted `<iframe>` (`TabBar` is the visual tab
  strip). Clicking a sidebar item calls `openTab()` instead of navigating the
  outer page, so the browser address bar stays on the initial load URL while
  the iframe swaps underneath — components needing "what's currently open"
  (e.g. Friday Rotation/Business Insights `return_to`) must read the active
  tab's `url` from `useTabContext()`, not `usePathname()`. Each tab's iframe
  loads with `?__tab=1`; because Next's router strips query params on
  client-side RSC fetches made from inside the iframe, `proxy.ts` also
  recognizes a `Sec-Fetch-Dest: iframe` header and a Referer containing
  `__tab=` to keep setting `x-tab-mode` on later same-iframe navigations
  (Edit, filters, pagination) → `(dashboard)/layout.tsx`'s injected script
  keeps the flag going forward the same way `popupGuard` does for `__popup`.
  `DocumentLink` clicked from inside a module's tab iframe still opens a
  genuine top-level OS popup window (native `window.open()` behavior, not
  nested in the iframe) — no glue code connects the two systems.

After a successful submit use `router.replace()`, never `push()` or
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
An active `attendance_kiosk` login linked through `staff.user_id` is an employee
self-service login: it can clock only its own attendance, view only its own
attendance history and payslips, and manage only its own leave applications.
The proxy confines that role to those self-service pages and an explicit
API/method allowlist; each allowed page/API also enforces organization and
linked-staff ownership. Migration 053 was manually applied on 14 Oct 2026 and
enforces one non-null `staff.user_id` link per login so self-service identity is
unambiguous. Migration 054 was first run on 14 Oct 2026 to enforce the same
own-record boundary against direct authenticated Supabase reads; its latest
resumable file still must be rerun before release.

### Company assets
Owner/admin manage the register; manager is view-only. Recording an asset
atomically creates one linked `asset_purchase` expense, and generic expense
create/edit/delete paths cannot mutate those capital purchases. Straight-line
depreciation is calculated on demand. Disposal is terminal; positive proceeds
require a cash/bank receipt method and feed the corresponding Cash or Bank Book
from the disposed asset record. Migration 052 was manually applied on 14 Oct
2026; its production effects still need independent verification.

Not clocking in creates **no row at all** — absence only exists if written. A
nightly job (`/api/attendance/auto-absent`, Vercel cron 00:00 UTC = 03:00 Kuwait)
now writes them, skipping Fridays, public holidays, anyone already recorded and
anyone not yet joined. Friday/holiday OT is paid to **everyone**;
`overtime_eligible` gates only ordinary weekday OT. `salary_runs` is
`UNIQUE(org, month, year)` — one run per month, which is why leave settlement is
paid as an advance (`staff.advance_balance` auto-recovers at month end) rather
than an off-cycle run.

### Leave applications
Every active employee login linked through `staff.user_id`, including an
`attendance_kiosk` login, can use `/my-leave` to request annual, sick or
compensation leave. Every self-service query and mutation remains scoped to the
linked staff row and its organization. Owner/admin review happens at
`/leave-applications`. Approval is atomic through `review_leave_application`:
it creates paid attendance (`leave`, or `sick_leave` for sick requests), skips
Fridays and known public holidays, and refuses to overwrite worked/manual
attendance. Only pristine rows carrying the exact auto-absence note may be
converted. Attendance rows linked to approved leave cannot be edited or deleted
directly; there is currently no approved-leave revocation workflow. Migration
048 adds the database-enforced version of those guards, revokes direct
`authenticated` attendance mutation, and serializes approval against attendance
and holiday changes. Once migration 056 is applied, newly approved Annual Leave
maps to `unpaid_leave`; its payroll daily rate is `(basic + housing + transport +
other + food + applicable seasonal fixed OT) / 30`, separate from ordinary
absence (which excludes food). Existing salary-slip history is preserved: the
exact approved annual-leave rows represented by an existing employee slip are
marked as paid snapshot `leave`, while historical dates without a matching slip
convert to `unpaid_leave`. New slips freeze `annual_leave_days` and
`annual_leave_deduction` separately, with database guards rejecting direct
financial snapshot rewrites. Paid runs remain non-resettable; resetting a
non-paid legacy run restores advances, converts that run's grandfathered annual
leave to unpaid, and removes slips/run atomically. Leave changes remain blocked
for any month with a salary run. Migration 049 removes duplicate PostgREST FK paths
introduced by 048 and fixes review lock ordering. Migration 050 rejects requests
for dates in a processed payroll month, serializes leave with payroll, derives
payroll attendance inside the database, and makes payroll process/reset atomic.
Those three migrations are physically applied. Migration 051 was applied and
verified on 14 Oct 2026; it supplies the attendance unique index required by
approval's `ON CONFLICT` and finalizes transactional salary payment/reset,
atomic leave settlement, attendance completeness checks and payroll allowance
itemization. Sick leave retains the informational 15-day annual counter rather
than a hard database cap.

### Audit logging
`logAudit()` swallows all errors by design. It wrote to columns that did not
exist, so **nothing was ever logged** until migration 030. If audit rows stop
appearing, suspect a schema mismatch, not the caller.

---

## Testing

Focused assertions for customer/vendor ledgers, vendor outstanding, document
routing (`document-tabs.assert.ts`), in-app module tabs (`tab-state.assert.ts`),
back navigation, and unpaid annual leave now live under `scripts/*.assert.ts`.
Additional older suites may still live in the session scratchpad. Run assertion
files with `npx tsx --tsconfig tsconfig.json <file>` **from the project root** —
the path alias breaks otherwise. Anything money- or stock-related should get a
test before it ships.

## Verifying UI changes

The user's Chrome is signed in and reachable through the claude-in-chrome tools.
Append `?__popup=1` to load a page the way a `DocumentLink` popup window would
(no sidebar), or `?__tab=1` to load it the way a `TabShell` module-tab iframe
would (also no sidebar — the chrome in both cases belongs to the outer window/
page, not the one being loaded). **Verify changes there rather than asking the
user to check** — several bugs in this app looked fixed and were not. Never
click anything that writes money or deletes data.
