import assert from 'node:assert/strict'
import {
  parseDocumentRoute,
  isDocumentTabOpenRequest,
  isDocumentTabAck,
  sanitizeDocumentLabel,
  createDocumentTabRequest,
  createDocumentTabAck,
  DOCUMENT_TAB_OPEN,
  DOCUMENT_TAB_ACK,
  DOCUMENT_TAB_PROTOCOL_VERSION,
} from '../src/lib/documentTabs'

// --- Accepted formal-document routes ---------------------------------------

const invoice = parseDocumentRoute('/finance/invoices/abc123')
assert.equal(invoice?.kind, 'invoice')
assert.equal(invoice?.tabKey, 'document:invoice:abc123')
assert.equal(invoice?.href, '/finance/invoices/abc123')

const quotation = parseDocumentRoute('/finance/quotations/q-1')
assert.equal(quotation?.kind, 'quotation')
assert.equal(quotation?.tabKey, 'document:quotation:q-1')

const purchaseInvoice = parseDocumentRoute('/inventory/purchase-invoices/pi-9')
assert.equal(purchaseInvoice?.kind, 'purchase-invoice')
assert.equal(purchaseInvoice?.tabKey, 'document:purchase-invoice:pi-9')

const purchaseOrder = parseDocumentRoute('/suppliers/po/po-7')
assert.equal(purchaseOrder?.kind, 'purchase-order')
assert.equal(purchaseOrder?.tabKey, 'document:purchase-order:po-7')

const payslip = parseDocumentRoute('/payroll/slips/run-1/staff-2')
assert.equal(payslip?.kind, 'payslip')
assert.equal(payslip?.tabKey, 'document:payslip:run-1:staff-2')

// Trailing slash is accepted and canonicalized.
assert.equal(parseDocumentRoute('/finance/invoices/abc123/')?.href, '/finance/invoices/abc123')

// --- Rejected routes -------------------------------------------------------

for (const bad of [
  '/finance/invoices',
  '/finance/invoices/new',
  '/finance/invoices/abc123/edit',
  '/finance/invoices/abc123/extra',
  '/finance/invoices/merge',
  '/finance/invoices/print-batch',
  '/finance/quotations',
  '/finance/quotations/new',
  '/finance/quotations/q-1/edit',
  '/inventory/purchase-invoices',
  '/inventory/purchase-invoices/new',
  '/inventory/purchase-invoices/pi-9/edit',
  '/suppliers/po',
  '/suppliers/po/new',
  '/suppliers/po/po-7/edit',
  '/payroll/slips',
  '/payroll/slips/run-1',
  '/payroll/slips/run-1/staff-2/extra',
  '/finance/payments/p-1',
  '/work-orders/wo-1',
  '/complaints/c-1',
  '/customers',
  'javascript:alert(1)',
  'https://example.com/finance/invoices/abc123',
  '//example.com/finance/invoices/abc123',
  '/finance/invoices/..',
  '/finance/invoices/.',
  '/finance/invoices/a%2Fb',
  '/finance/invoices/%00',
]) {
  assert.equal(parseDocumentRoute(bad), null, `should reject: ${bad}`)
}

// --- Identity: query, fragment, return_to and __tab never change tabKey -----

const base = parseDocumentRoute('/finance/invoices/abc123')!
const withOrigin = parseDocumentRoute('/finance/invoices/abc123?return_to=%2Ffinance%2Finvoices%3Fstatus%3Doverdue')!
assert.equal(withOrigin.tabKey, base.tabKey)
assert.equal(withOrigin.href, '/finance/invoices/abc123?return_to=%2Ffinance%2Finvoices%3Fstatus%3Doverdue')

const withTab = parseDocumentRoute('/finance/invoices/abc123?__tab=1&return_to=x')!
assert.equal(withTab.tabKey, base.tabKey)
assert.equal(withTab.href, '/finance/invoices/abc123?return_to=x')

const withFragment = parseDocumentRoute('/finance/invoices/abc123#summary')!
assert.equal(withFragment.tabKey, base.tabKey)
assert.equal(withFragment.href, '/finance/invoices/abc123#summary')

const otherInvoice = parseDocumentRoute('/finance/invoices/def456')!
assert.notEqual(otherInvoice.tabKey, base.tabKey)

const otherStaff = parseDocumentRoute('/payroll/slips/run-1/staff-3')!
assert.notEqual(otherStaff.tabKey, payslip!.tabKey)

// --- Protocol type guards ----------------------------------------------------

const request = createDocumentTabRequest('req-1', base, '  INV-001\n ')
assert.equal(request.type, DOCUMENT_TAB_OPEN)
assert.equal(request.version, DOCUMENT_TAB_PROTOCOL_VERSION)
assert.equal(request.href, '/finance/invoices/abc123')
assert.equal(request.label, 'INV-001') // sanitized
assert.ok(isDocumentTabOpenRequest(request))

const ack = createDocumentTabAck('req-1')
assert.equal(ack.type, DOCUMENT_TAB_ACK)
assert.equal(ack.accepted, true)
assert.ok(isDocumentTabAck(ack))

assert.equal(isDocumentTabOpenRequest({ ...request, version: 2 }), false)
assert.equal(isDocumentTabOpenRequest({ ...request, type: 'other' }), false)
assert.equal(isDocumentTabOpenRequest({ ...request, requestId: '' }), false)
assert.equal(isDocumentTabOpenRequest({ ...request, requestId: 'bad\nid' }), false)
assert.equal(isDocumentTabOpenRequest({ ...request, label: null }), false)
assert.equal(isDocumentTabOpenRequest(null), false)
assert.equal(isDocumentTabOpenRequest('nope'), false)

assert.equal(isDocumentTabAck({ ...ack, accepted: false }), false)
assert.equal(isDocumentTabAck({ ...ack, version: 2 }), false)
assert.equal(isDocumentTabAck({ ...ack, requestId: '' }), false)
assert.equal(isDocumentTabAck(null), false)

// --- Label sanitization -----------------------------------------------------

assert.equal(sanitizeDocumentLabel('  Invoice   #1  ', 'Invoice'), 'Invoice #1')
assert.equal(sanitizeDocumentLabel('bad\u0000control\u0007', 'Invoice'), 'bad control')
assert.equal(sanitizeDocumentLabel('   ', 'Invoice'), 'Invoice')
assert.equal(sanitizeDocumentLabel(42, 'Invoice'), 'Invoice')
assert.equal(sanitizeDocumentLabel('x'.repeat(500), 'Invoice').length, 120)

console.log('document-tabs assertions passed')
