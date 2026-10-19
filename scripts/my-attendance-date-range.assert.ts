import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const source = readFileSync(
  resolve(root, 'src/app/(dashboard)/my-attendance/page.tsx'),
  'utf8',
).replace(/\r\n/g, '\n')

assert.ok(
  source.includes('const today = kuwaitISODate()'),
  'my-attendance must use the Kuwait-local current date',
)

const recentQueryStart = source.indexOf('const { data: records } = await admin')
const recentQueryEnd = source.indexOf('recentRecords =', recentQueryStart)
assert.ok(
  recentQueryStart >= 0 && recentQueryEnd > recentQueryStart,
  'my-attendance recent-record query must be present',
)

const recentQuery = source.slice(recentQueryStart, recentQueryEnd)
const markers = [
  ".gte('date', fromDate)",
  ".lte('date', today)",
  ".order('date', { ascending: false })",
  '.limit(30)',
]

let previousIndex = -1
for (const marker of markers) {
  const index = recentQuery.indexOf(marker)
  assert.ok(index > previousIndex, `recent-record query is missing or misorders: ${marker}`)
  previousIndex = index
}

console.log('my-attendance date range assertions passed')
