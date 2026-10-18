import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8').replace(/\r\n/g, '\n')

const page = read('src/app/(dashboard)/work-orders/page.tsx')
for (const marker of [
  'const { user, profile } = await getAuthedProfile()',
  "const isTechnician = profile.role === 'technician'",
  ".eq('employment_status', 'active')",
  ".eq('organization_id', profile.organization_id)",
  'assigned_to.eq.${user.id},assigned_staff_id.eq.${ownStaffId}',
  "isTechnician\n        ? 'id, work_order_number, job_description, priority, status, payment_status, scheduled_date, assigned_to, assigned_staff_id",
  '{!isTechnician && (',
]) {
  assert.ok(page.includes(marker), `work-order list is missing: ${marker}`)
}

const migration = read('supabase/migrations/058_work_order_staff_assignment_rls.sql')
for (const marker of [
  'create or replace function public.adjust_inventory_stock_logged(',
  'and organization_id = p_org_id',
  'and current_stock + p_delta >= 0',
  "raise exception 'insufficient stock for item %'",
  'drop policy if exists "work_orders_org_isolation"',
  'create policy "work_orders_select_org_or_assignment"',
  'for select',
  'assigned_to = auth.uid()',
  'public.is_work_order_assigned_to_current_technician(',
  'security definer',
  'set search_path = public',
  's.id = p_assigned_staff_id',
  's.organization_id = p_organization_id',
  's.user_id = auth.uid()',
  "s.employment_status = 'active'",
  'revoke all privileges on table public.work_orders from authenticated',
  'grant select on table public.work_orders to authenticated',
]) {
  assert.ok(migration.includes(marker), `work-order RLS migration is missing: ${marker}`)
}
assert.equal(
  migration.includes('create policy "work_orders_org_isolation" on public.work_orders\n  for all'),
  false,
  'work-order RLS must not grant technicians direct writes through a FOR ALL policy',
)

console.log('technician work-order list assertions passed')
