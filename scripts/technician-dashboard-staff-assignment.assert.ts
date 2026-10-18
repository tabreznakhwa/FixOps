import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const page = readFileSync(
  resolve(root, 'src/app/technician/page.tsx'),
  'utf8',
).replace(/\r\n/g, '\n')

for (const marker of [
  ".eq('user_id', user.id)",
  ".eq('employment_status', 'active')",
  'assigned_to.eq.${user.id},assigned_staff_id.eq.${staffId}',
  ": jobsQuery.eq('assigned_to', user.id)",
]) {
  assert.ok(page.includes(marker), `technician dashboard is missing: ${marker}`)
}

console.log('technician dashboard staff-assignment assertions passed')
