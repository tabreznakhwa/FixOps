import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8').replace(/\r\n/g, '\n')
const report = read('src/app/(dashboard)/reports/page.tsx')

for (const marker of [
  "import { readPagedRows } from '@/lib/reportPaging'",
  "'selected-period invoices'",
  "'six-month invoices'",
  "'customer payments'",
  "'receivables aging'",
  ".order('invoice_date', { ascending: true })",
  ".order('payment_date', { ascending: true })",
  ".order('due_date', { ascending: true, nullsFirst: true })",
  ".order('id', { ascending: true })",
  '.range(pageFrom, pageTo)',
  '<strong>These figures are incomplete.</strong>',
]) {
  assert.ok(report.includes(marker), `finance reports paging missing: ${marker}`)
}

assert.equal(
  (report.match(/readPagedRows<any>\(/g) ?? []).length,
  4,
  'every unbounded Finance Reports source must be paged',
)
assert.equal(
  (report.match(/await Promise\.all\(\[/g) ?? []).length,
  1,
  'Finance Reports sources should remain concurrent',
)

const exportRoute = read('src/app/api/reports/export/route.ts')
for (const marker of [
  "import { readPagedRows } from '@/lib/reportPaging'",
  "'invoice export'",
  ".order('invoice_date', { ascending: false })",
  ".order('id', { ascending: false })",
  'return query.range(pageFrom, pageTo)',
  'Unable to export a complete report. Please try again.',
]) {
  assert.ok(exportRoute.includes(marker), `finance reports export paging missing: ${marker}`)
}

console.log('finance reports paging assertions passed')
