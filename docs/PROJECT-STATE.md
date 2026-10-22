# FixOps — current state

Read this first. It exists so a new session does not have to rediscover the app
by exploration. Last updated 20 Oct 2026.

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
function, grant and reconciliation checks. Migration 057
(`057_technician_work_order_cash_collection.sql`) was manually applied by the
user on 18 Oct 2026; its production function body and grants have not yet been
independently verified. It extends `record_customer_payment` so an active
technician can collect cash only for a work order assigned directly to their
login or to their active linked staff row. The application route repeats those
checks, and the RPC continues to be executable by `service_role` only. Do not
use `db push --include-all` to reconcile migration history. Migrations 058
(`058_work_order_staff_assignment_rls.sql`) and 059
(`059_work_order_payment_snapshot.sql`) were manually applied by the user on
18 Oct 2026; their production effects have not yet been independently verified.
Migration 058 revokes direct authenticated work-order writes, keeps read access,
allows a technician to read only direct or active staff-linked assignments
through a tightly scoped `SECURITY DEFINER` predicate, and adds a serialized
nonnegative-stock guard to `adjust_inventory_stock_logged`. The application now
routes technician status changes through the guarded server API. Migration 059
keeps `record_customer_payment` compatible with migration 057 and updates a
work-order-only receipt snapshot to `partial` or `paid` before an invoice exists;
the route prevents the cumulative receipt from exceeding a known positive work-
order amount, and invoice issuance later adopts and fully reconciles those
receipts. Migration 060 (`060_work_order_payment_limit.sql`) was manually
applied by the user on 18 Oct 2026; its production function body, grants,
rejection behavior and migration-history entry have not yet been independently
verified. It makes the database transaction reject un-invoiced receipts until
the work order has a positive final amount, and rejects a cumulative receipt
above that amount under the same work-order row lock. Migration 061
(`061_customer_payment_settlement_discount.sql`) was manually applied by the
user on 20 Oct 2026, but the local migration was subsequently hardened with
explicit numeric-NaN rejection, tenant-scoped customer validation and stricter
posting-component checks. **Rerun the latest migration 061 file before release**
(it is idempotent), because the manually applied version may not include those
hardening changes. Its production schema, function bodies, grants, reversal
behavior and migration-history entry have not yet been independently verified.
It adds a per-invoice customer settlement discount: each receipt stores cash
and discount separately, posts the discount as a distinct non-cash AR credit,
and treats cash + discount + customer-advance allocations as the invoice's
settled amount. Cash/Bank Book and collection totals continue to sum only
`amount_received`. Discounts remain forbidden for advances, opening
receivables, invoice-less work-order receipts and technician collections.
Cancelling a discounted receipt must reverse every cash/discount posting
component atomically and rebuild the affected invoice snapshot. Do not use
`db push --include-all` to reconcile their migration history.
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
  purchase invoices, purchase orders, payslips) open in their own OS popup
  window on desktop via `DocumentLink` (`src/components/ui/DocumentLink.tsx`,
  `window.open()` keyed by a stable `tabKey` so reopening the same document
  focuses one window instead of stacking more). On phone/tablet-sized or
  coarse-pointer browsers, `DocumentLink` deliberately falls back to normal
  same-window navigation because mobile browsers do not provide reliable
  desktop-style popup windows. A desktop popup's own page renders without the
  sidebar via a `?__popup=1` flag threaded through `proxy.ts` → `x-popup-mode`
  header → `(dashboard)/layout.tsx`, whose injected script keeps that flag on
  subsequent client-side navigations inside the same popup.
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

### Technician work orders
An active technician can see and mutate only work orders assigned directly to
their login (`assigned_to`) or through their active linked staff row
(`assigned_staff_id` → `staff.user_id`). Both application routes and RLS must
honour those two assignment forms. Direct authenticated work-order writes are
revoked by migration 058; all mutations go through the guarded server APIs.
Technician-created work orders are forced to self-assignment server-side.
Technicians may add, edit and remove Custom, Part and Service line items on
their assigned job, including after completion/verification, until a non-cancelled
invoice (draft included) or active direct Work Order payment exists. They may
also edit only service category, job description and internal notes until a
non-cancelled invoice exists; priority, assignment, scheduling, estimates,
final amount and payment fields remain privileged. They can enter the customer-
facing unit price, see line totals and the final work-order amount, and advance
only through valid job-status transitions. Internal inventory purchase cost
remains private and inventory movement is still valued from `purchase_price`;
technicians still cannot edit assignment or other financial fields or cancel a
work order. Only the assigned
technician can mark a work order completed — admin, manager, owner and
call_center no longer have a Mark Complete action of their own (enforced both
in `WorkOrderActions` and server-side in the work-order PATCH route) and move
straight to invoicing once the technician completes the job. A work order
assigned only to a staff member with no linked login therefore has no path to
`completed` until it is reassigned to someone who can log in and complete it
themselves. Payment collection is cash only on their own work order;
route and `record_customer_payment` independently enforce this. Migration 059
keeps the work-order payment snapshot current for pre-invoice receipts.
Migration 060 (manually applied 18 Oct 2026; production effects not yet
independently verified) requires a positive work-order total before an
un-invoiced receipt and enforces the cumulative limit under the work-order row
lock. The work-order detail shows customer line-item pricing and its final
amount to the assigned technician, while the work-order list and invoice
controls remain hidden from technicians. `work_order_line_items` RLS/grants are
not established by the tracked migration history; verify live `pg_policies` and
role grants before rollout. If `authenticated` has direct DML access, harden it
separately using migration 058's server-only mutation pattern rather than
assuming the admin-client API routes are the only write path. The application
currently checks invoice/payment activity immediately before a separate write;
a concurrent invoice/payment creation can still race that check until these
mutations share a row-locked database transaction.

### Customer settlement discounts

Migration 061 was manually applied on 20 Oct 2026, but its latest local file
contains additional hardening and must be rerun before release. Its production
effects have not yet been independently verified. A direct invoice payment may
use cash plus a per-invoice settlement discount, including an ordinary partial
cash payment or a full-discount settlement with zero cash. The payment row stores
both values;
the canonical AR journal posts cash as a `payment` credit and the discount as a
separate `customer_payment_discount` adjustment credit. `invoices.amount_paid`
is the total settled from active direct-payment cash, active settlement
discounts, and active customer-advance allocations. Cash collection reports,
Cash Book and Bank Book remain cash-only. Discounts are never allowed on
advances, opening receivables, invoice-less work-order receipts or technician
collections. With one selected invoice, Cash Received remains editable so a
normal partial payment does not need to be misclassified as discount; multiple
selected invoices retain the existing full-settlement-per-invoice behavior.
Cancellation validates and reverses the exact one or two original posting
components in one transaction before rebuilding invoice/work-order snapshots.

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

Migration 058 (manually applied 18 Oct 2026; production effects not yet
independently verified) preserves the stock+ledger atomic RPC and adds the
database-side `current_stock + delta >= 0` condition needed to prevent concurrent
part issues from driving stock negative. It also makes `work_orders` direct
browser access read-only; technician status changes now use
`/api/work-orders/[id]`. The TypeScript availability check is only a friendly
pre-check; do not remove the RPC guard.

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

Owner/admin can override **Existing advance recovered** during leave-settlement
preview with zero, a partial amount, or the full available amount. Manager can
still process a settlement but cannot override recovery. The recovery only nets
that amount from today's cash (`payout = earned - recovery`); it is metadata on
the settlement advance, not a repayment ledger credit. The canonical balance is
still `prior balance + payout`, and month-end payroll recovers that full balance.
Migration 062 (`062_leave_settlement_advance_recovery.sql`) was manually applied
by the user on 22 Oct 2026; its production column types, function signature/grants
and recovery behavior have not yet been independently verified. Never use
`db push --include-all`. Migration 062 removes the old eight-argument RPC, so only
the compatible application may process leave settlements; verify deployment
before reopening settlement. There is still no leave-settlement cancel/void
workflow.

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
