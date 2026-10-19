import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8').replace(/\r\n/g, '\n')

const permissions = read('src/lib/orgPermissions.ts')
for (const marker of [
  "import { cache } from 'react'",
  'export const getRoleAccess = cache(async (orgId: string, role: string): Promise<ModuleAccess> =>',
  'LOCKED_ROLES.includes(role)',
  ".from('role_permissions')",
  ".eq('organization_id', orgId)",
  ".eq('role', role)",
  'export async function getOrgPermissionsMatrix(',
]) {
  assert.ok(permissions.includes(marker), `orgPermissions missing: ${marker}`)
}

const complaint = read('src/app/(dashboard)/complaints/[id]/page.tsx')
for (const marker of [
  'const { user, profile } = await getAuthedProfile()',
  "if (!profile || profile.status !== 'active' || !profile.organization_id) redirect('/login')",
  "const canEditAnyNote = ['owner', 'admin', 'manager'].includes(profile.role)",
  'currentUserId={user?.id ?? null}',
]) {
  assert.ok(complaint.includes(marker), `complaint detail missing: ${marker}`)
}
for (const removed of ['supabase.auth.getUser()', 'currentUserRes', 'currentUserRole', 'authUser']) {
  assert.equal(complaint.includes(removed), false, `complaint detail still references: ${removed}`)
}

const reports = read('src/app/(dashboard)/reports/page.tsx')
assert.equal(
  (reports.match(/await Promise\.all\(\[/g) ?? []).length,
  1,
  'reports must resolve its four independent reads through one Promise.all',
)
for (const marker of [
  '{ data: invoicesRaw }',
  '{ data: allInvoicesRaw }',
  '{ data: paymentsRaw }',
  '{ data: agingRaw }',
  "not('status', 'in', '(cancelled,written_off)')",
  "eq('is_cancelled', false)",
  "in('status', ['issued', 'partial', 'overdue'])",
  ".gt('balance_due', 0)",
]) {
  assert.ok(reports.includes(marker), `reports missing: ${marker}`)
}

const staff = read('src/app/(dashboard)/staff/[id]/page.tsx')
for (const marker of [
  "import { getAuthedProfile } from '@/lib/auth/session'",
  'getAuthedProfile(),',
  'if (!staffRaw) notFound()',
  'const orgId = profile?.organization_id',
  "['owner', 'admin', 'hr', 'manager'].includes(profile?.role ?? '')",
]) {
  assert.ok(staff.includes(marker), `staff detail missing: ${marker}`)
}
assert.equal(staff.includes('supabase.auth.getUser()'), false, 'staff detail must reuse getAuthedProfile')
for (const marker of [
  'const [\n    { data: staffRaw },',
  'const [{ data: candidateUsersRaw }, { data: linkedStaffRaw }] = await Promise.all([',
]) {
  assert.ok(staff.includes(marker), `staff detail missing a parallel query wave: ${marker}`)
}

const loadingPath = resolve(root, 'src/app/(dashboard)/loading.tsx')
assert.ok(existsSync(loadingPath), 'dashboard loading component must exist')
const loading = read('src/app/(dashboard)/loading.tsx')
assert.ok(loading.includes('export default function DashboardLoading()'), 'dashboard loading component needs a default export')
assert.ok(loading.includes('animate-pulse'), 'dashboard loading component needs a visible skeleton')
for (const forbidden of ['createClient', 'getAuthedProfile', 'supabase', "from 'next/navigation'", "'use client'"]) {
  assert.equal(loading.includes(forbidden), false, `dashboard loading component must stay data-free: ${forbidden}`)
}

console.log('basic performance assertions passed')
