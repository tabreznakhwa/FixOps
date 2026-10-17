import assert from 'node:assert/strict'
import {
  parseDocumentRoute,
  sanitizeDocumentLabel,
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

const workOrder = parseDocumentRoute('/work-orders/wo-1')
assert.equal(workOrder?.kind, 'work-order')
assert.equal(workOrder?.tabKey, 'document:work-order:wo-1')
assert.equal(workOrder?.href, '/work-orders/wo-1')

const complaint = parseDocumentRoute('/complaints/c-1')
assert.equal(complaint?.kind, 'complaint')
assert.equal(complaint?.tabKey, 'document:complaint:c-1')
assert.equal(complaint?.href, '/complaints/c-1')

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
  '/work-orders',
  '/work-orders/new',
  '/work-orders/wo-1/edit',
  '/work-orders/wo-1/extra',
  '/complaints',
  '/complaints/new',
  '/complaints/c-1/edit',
  '/complaints/c-1/extra',
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

// --- Identity: query, fragment, return_to and __popup never change tabKey ---

const base = parseDocumentRoute('/finance/invoices/abc123')!
const withOrigin = parseDocumentRoute('/finance/invoices/abc123?return_to=%2Ffinance%2Finvoices%3Fstatus%3Doverdue')!
assert.equal(withOrigin.tabKey, base.tabKey)
assert.equal(withOrigin.href, '/finance/invoices/abc123?return_to=%2Ffinance%2Finvoices%3Fstatus%3Doverdue')

const withPopup = parseDocumentRoute('/finance/invoices/abc123?__popup=1&return_to=x')!
assert.equal(withPopup.tabKey, base.tabKey)
assert.equal(withPopup.href, '/finance/invoices/abc123?return_to=x')

const withFragment = parseDocumentRoute('/finance/invoices/abc123#summary')!
assert.equal(withFragment.tabKey, base.tabKey)
assert.equal(withFragment.href, '/finance/invoices/abc123#summary')

const otherInvoice = parseDocumentRoute('/finance/invoices/def456')!
assert.notEqual(otherInvoice.tabKey, base.tabKey)

const otherStaff = parseDocumentRoute('/payroll/slips/run-1/staff-3')!
assert.notEqual(otherStaff.tabKey, payslip!.tabKey)

const workOrderFromComplaint = parseDocumentRoute(
  '/work-orders/wo-1?complaint_id=c-1&return_to=%2Fcomplaints%2Fc-1&__popup=1',
)!
assert.equal(workOrderFromComplaint.tabKey, workOrder!.tabKey)
assert.equal(workOrderFromComplaint.href, '/work-orders/wo-1?complaint_id=c-1&return_to=%2Fcomplaints%2Fc-1')

const otherWorkOrder = parseDocumentRoute('/work-orders/wo-2')!
assert.notEqual(otherWorkOrder.tabKey, workOrder!.tabKey)

const complaintFromList = parseDocumentRoute(
  '/complaints/c-1?return_to=%2Fcomplaints%3Fstatus%3Dnew&__popup=1',
)!
assert.equal(complaintFromList.tabKey, complaint!.tabKey)
assert.equal(complaintFromList.href, '/complaints/c-1?return_to=%2Fcomplaints%3Fstatus%3Dnew')

const otherComplaint = parseDocumentRoute('/complaints/c-2')!
assert.notEqual(otherComplaint.tabKey, complaint!.tabKey)

// --- Label sanitization -----------------------------------------------------

assert.equal(sanitizeDocumentLabel('  Invoice   #1  ', 'Invoice'), 'Invoice #1')
assert.equal(sanitizeDocumentLabel('bad\u0000control\u0007', 'Invoice'), 'bad control')
assert.equal(sanitizeDocumentLabel('   ', 'Invoice'), 'Invoice')
assert.equal(sanitizeDocumentLabel(42, 'Invoice'), 'Invoice')
assert.equal(sanitizeDocumentLabel('x'.repeat(500), 'Invoice').length, 120)

console.log('document-tabs assertions passed')
