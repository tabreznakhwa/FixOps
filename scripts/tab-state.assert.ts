import assert from 'node:assert/strict'
import {
  createTab,
  openOrFocusTab,
  syncTabUrl,
} from '../src/contexts/tabState'

const source = createTab(
  '/finance/receivables?status=overdue',
  'Receivables',
  'path:/finance/receivables',
)
const firstInvoiceHref = '/finance/invoices/inv-1?return_to=%2Ffinance%2Freceivables%3Fstatus%3Doverdue'
const opened = openOrFocusTab(
  [source],
  firstInvoiceHref,
  'INV-001',
  'document:invoice:inv-1',
)

assert.equal(opened.tabs.length, 2)
assert.notEqual(opened.activeTabId, source.id)
assert.equal(opened.tabs[1].url, firstInvoiceHref)

const currentSource = '/finance/outstanding?supplier_id=supplier-1'
const reopenedHref = `/finance/invoices/inv-1?return_to=${encodeURIComponent(currentSource)}`
const reopened = openOrFocusTab(
  opened.tabs,
  reopenedHref,
  'INV-001 · Customer A',
  'document:invoice:inv-1',
)

assert.equal(reopened.tabs.length, 2, 'same formal document must focus its existing tab')
assert.equal(reopened.activeTabId, opened.tabs[1].id)
assert.equal(reopened.tabs[1].url, reopenedHref, 'reopening must retain the latest navigation origin')
assert.equal(reopened.tabs[1].label, 'INV-001 · Customer A')

const otherInvoice = openOrFocusTab(
  reopened.tabs,
  '/finance/invoices/inv-2',
  'INV-002',
  'document:invoice:inv-2',
)
assert.equal(otherInvoice.tabs.length, 3, 'different formal documents need separate tabs')

const navigated = syncTabUrl(
  otherInvoice.tabs,
  source.id,
  '/finance/ledger?customer_id=customer-1&__tab=1#statement',
)
assert.equal(
  navigated.find((tab) => tab.id === source.id)?.url,
  '/finance/ledger?customer_id=customer-1#statement',
  'iframe navigation must update the shell URL and remove iframe-only state',
)

const invalid = syncTabUrl(navigated, source.id, 'https://example.com/finance/ledger')
assert.equal(invalid, navigated, 'invalid iframe locations must not replace shell tab state')

const originalDocumentKey = navigated[1].tabKey
const navigatedDocument = syncTabUrl(
  navigated,
  navigated[1].id,
  '/finance/invoices/inv-1?return_to=%2Fwork-orders%2Fwo-1&__tab=1',
)
assert.equal(navigatedDocument[1].tabKey, originalDocumentKey, 'URL synchronization must preserve stable document identity')
assert.equal(
  navigatedDocument[1].url,
  '/finance/invoices/inv-1?return_to=%2Fwork-orders%2Fwo-1',
)

const documentBackToList = syncTabUrl(
  navigatedDocument,
  navigatedDocument[1].id,
  '/finance/invoices?status=overdue&__tab=1',
)
assert.equal(documentBackToList[1].url, '/finance/invoices?status=overdue')
assert.equal(documentBackToList[1].label, 'Invoices')
assert.equal(documentBackToList[1].tabKey, 'path:/finance/invoices')

const documentNavigatesToOtherDocument = syncTabUrl(
  documentBackToList,
  documentBackToList[1].id,
  '/finance/invoices/inv-2?__tab=1',
)
assert.equal(documentNavigatesToOtherDocument[1].url, '/finance/invoices/inv-2')
assert.equal(documentNavigatesToOtherDocument[1].label, 'Invoice')
assert.equal(documentNavigatesToOtherDocument[1].tabKey, 'document:invoice:inv-2')

console.log('tab state assertions passed')
