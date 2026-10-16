import assert from 'node:assert/strict'
import {
  currentPath,
  detailPath,
  labelForPath,
  resolveBack,
  resolveBackWithLegacy,
  returnToFromFormData,
  safeReturnTo,
  stripTabParam,
  withReturnTo,
} from '../src/lib/backNav'

assert.equal(safeReturnTo('/complaints?status=open#today'), '/complaints?status=open#today')
assert.equal(safeReturnTo('/inventory/assets?__tab=1&status=active'), '/inventory/assets?status=active')
assert.equal(safeReturnTo('/dashboard?__tab=1'), '/dashboard')
assert.equal(safeReturnTo(['/complaints', '/work-orders']), null)
assert.equal(safeReturnTo('https://example.com'), null)
assert.equal(safeReturnTo('//example.com'), null)
assert.equal(safeReturnTo('/\\example.com'), null)
assert.equal(safeReturnTo('/complaints\n'), null)
assert.equal(safeReturnTo(' /complaints'), null)
assert.equal(stripTabParam('/complaints?__tab=1&q=AC#open'), '/complaints?q=AC#open')

assert.equal(
  currentPath('/finance/invoices', { status: 'overdue', page: '2', __tab: '1' }),
  '/finance/invoices?status=overdue&page=2',
)
assert.equal(
  currentPath('/complaints', { status: ['new', 'assigned'], q: 'a&b' }),
  '/complaints?status=new&status=assigned&q=a%26b',
)
const params = new URLSearchParams('q=AC&status=open&__tab=1')
assert.equal(currentPath('/work-orders', params), '/work-orders?q=AC&status=open')

assert.equal(labelForPath('/inventory/assets/123?return_to=x'), 'Company Assets')
assert.equal(labelForPath('/inventory/purchase-invoices/123'), 'Purchase Invoices')
assert.equal(labelForPath('/unknown', 'Page'), 'Page')
assert.deepEqual(
  resolveBack('/finance/receivables?customer_id=1', '/finance/invoices', 'Invoices'),
  { href: '/finance/receivables?customer_id=1', label: 'Receivables' },
)
assert.deepEqual(
  resolveBack('javascript:alert(1)', '/finance/invoices', 'Invoices'),
  { href: '/finance/invoices', label: 'Invoices' },
)

assert.equal(
  withReturnTo('/finance/invoices/abc?mode=print', '/work-orders/wo-1?return_to=%2Fcomplaints%2Fc-1'),
  '/finance/invoices/abc?mode=print&return_to=%2Fwork-orders%2Fwo-1%3Freturn_to%3D%252Fcomplaints%252Fc-1',
)
assert.throws(() => withReturnTo('https://example.com', '/dashboard'))
assert.equal(detailPath('/complaints/c-1', '/complaints?status=new'), '/complaints/c-1?return_to=%2Fcomplaints%3Fstatus%3Dnew')

assert.deepEqual(
  resolveBackWithLegacy({
    returnTo: '/finance/receivables?status=overdue',
    legacy: [
      { when: 'wo-1', href: '/work-orders/wo-1', label: 'Work Order' },
      { when: 'c-1', href: '/complaints/c-1', label: 'Complaint' },
    ],
    fallbackHref: '/finance/invoices',
    fallbackLabel: 'Invoices',
  }),
  { href: '/finance/receivables?status=overdue', label: 'Receivables' },
)
assert.deepEqual(
  resolveBackWithLegacy({
    returnTo: null,
    legacy: [
      { when: 'wo-1', href: '/work-orders/wo-1', label: 'Work Order' },
      { when: 'c-1', href: '/complaints/c-1', label: 'Complaint' },
    ],
    fallbackHref: '/finance/invoices',
    fallbackLabel: 'Invoices',
  }),
  { href: '/work-orders/wo-1', label: 'Work Order' },
)

const complaint = withReturnTo('/complaints/c-1', '/complaints?status=assigned&page=2')
const workOrder = withReturnTo('/work-orders/wo-1', complaint)
const invoice = withReturnTo('/finance/invoices/i-1', workOrder)
const payment = withReturnTo('/finance/payments/p-1', invoice)
assert.deepEqual(resolveBack(new URL(payment, 'https://fixops.internal').searchParams.get('return_to'), '/finance/payments'), {
  href: invoice,
  label: 'Invoices',
})
assert.deepEqual(resolveBack(new URL(invoice, 'https://fixops.internal').searchParams.get('return_to'), '/finance/invoices'), {
  href: workOrder,
  label: 'Work Orders',
})
assert.deepEqual(resolveBack(new URL(workOrder, 'https://fixops.internal').searchParams.get('return_to'), '/work-orders'), {
  href: complaint,
  label: 'Complaints',
})

const validForm = new FormData()
validForm.append('return_to', '/complaints?status=new')
assert.equal(returnToFromFormData(validForm), '/complaints?status=new')
const repeatedForm = new FormData()
repeatedForm.append('return_to', '/complaints')
repeatedForm.append('return_to', '/work-orders')
assert.equal(returnToFromFormData(repeatedForm), null)

console.log('back navigation assertions passed')
