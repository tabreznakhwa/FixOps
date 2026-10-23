import { isValidISODate, isValidMoney } from '@/lib/assets'

export const SUPPLIER_PAYMENT_MODES = [
  'bank_transfer',
  'cheque',
  'cash',
  'knet',
  'pos',
  'online',
  'card',
  'other',
] as const

export const MAX_SUPPLIER_PAYMENT_SETTLEMENTS = 100

export type SupplierPaymentMode = typeof SUPPLIER_PAYMENT_MODES[number]

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/
const LEGACY_ALLOCATION_KEYS = [
  'purchase_order_id',
  'invoice_ids',
  'opening_payable_ids',
] as const
const REQUEST_KEYS = new Set([
  'supplier_id',
  'settlements',
  'payment_date',
  'payment_mode',
  'reference_number',
  'notes',
])
const SETTLEMENT_KEYS = new Set([
  'purchase_invoice_id',
  'expected_balance_due',
  'amount_paid',
  'discount_amount',
])

export type SupplierInvoiceSettlementInput = {
  purchaseInvoiceId: string
  expectedBalanceDue: number
  amountPaid: number
  discountAmount: number
}

export type SupplierPaymentInput = {
  supplierId: string
  settlements: SupplierInvoiceSettlementInput[]
  paymentDate: string
  paymentMode: SupplierPaymentMode
  referenceNumber: string | null
  notes: string | null
}

type ParsedSupplierPayment =
  | { success: true; value: SupplierPaymentInput }
  | { success: false; error: string }

type InvoiceSettlement = {
  balance: number
  discount: number
  cash: number
}

type ParsedInvoiceSettlement =
  | { success: true; value: InvoiceSettlement }
  | { success: false; error: string }

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function optionalText(value: unknown): string | null | undefined {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  if (!normalized) return null
  if (normalized.length > 1000) return undefined
  return normalized
}

function isValidKwdAmount(value: unknown): boolean {
  if (typeof value === 'string') return isValidMoney(value)
  if (typeof value !== 'number' || !Number.isFinite(value)) return false
  return value >= 0 && Math.abs(value * 1000 - Math.round(value * 1000)) < 1e-7
}

export function toKwdFils(value: unknown): number | null {
  if (!isValidKwdAmount(value)) return null
  const amount = Number(value)
  if (amount < 0) return null
  return Math.round(amount * 1000)
}

export function calculateSupplierInvoiceSettlement(
  balanceDue: unknown,
  discountAmount: unknown,
  cashAmount?: unknown,
): ParsedInvoiceSettlement {
  const balanceFils = toKwdFils(balanceDue)
  if (balanceFils === null || balanceFils <= 0) {
    return { success: false, error: 'Invoice balance must be greater than zero' }
  }

  const normalizedDiscount = discountAmount === '' || discountAmount === null || discountAmount === undefined
    ? 0
    : discountAmount
  const discountFils = toKwdFils(normalizedDiscount)
  if (discountFils === null) {
    return {
      success: false,
      error: 'Discount must be a valid KWD amount with up to three decimal places',
    }
  }
  if (discountFils > balanceFils) {
    return { success: false, error: 'Discount cannot exceed the invoice balance' }
  }

  const cashFils = cashAmount === undefined
    ? balanceFils - discountFils
    : toKwdFils(cashAmount)
  if (cashFils === null) {
    return {
      success: false,
      error: 'Amount paid must be a valid KWD amount with up to three decimal places',
    }
  }

  const settlementFils = cashFils + discountFils
  if (settlementFils <= 0) {
    return { success: false, error: 'Cash paid or discount must be greater than zero' }
  }
  if (settlementFils > balanceFils) {
    return { success: false, error: 'Cash paid plus discount cannot exceed the invoice balance' }
  }

  return {
    success: true,
    value: {
      balance: balanceFils / 1000,
      discount: discountFils / 1000,
      cash: cashFils / 1000,
    },
  }
}

export function parseSupplierPaymentInput(body: unknown): ParsedSupplierPayment {
  if (!isObject(body)) return { success: false, error: 'Invalid request body' }

  for (const key of LEGACY_ALLOCATION_KEYS) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      return {
        success: false,
        error: 'Purchase orders, opening payables, and legacy multi-bill allocations are not supported',
      }
    }
  }
  const unknownRequestKey = Object.keys(body).find((key) => !REQUEST_KEYS.has(key))
  if (unknownRequestKey) {
    return { success: false, error: `Unsupported supplier payment field: ${unknownRequestKey}` }
  }

  const supplierId = body.supplier_id
  if (typeof supplierId !== 'string' || !UUID_RE.test(supplierId)) {
    return { success: false, error: 'A valid supplier is required' }
  }

  if (!Array.isArray(body.settlements) || body.settlements.length === 0) {
    return {
      success: false,
      error: 'Select at least one purchase invoice; unallocated supplier cash must be recorded as an advance',
    }
  }
  if (body.settlements.length > MAX_SUPPLIER_PAYMENT_SETTLEMENTS) {
    return {
      success: false,
      error: `A vendor payment can settle at most ${MAX_SUPPLIER_PAYMENT_SETTLEMENTS} invoices`,
    }
  }

  const settlements: SupplierInvoiceSettlementInput[] = []
  const invoiceIds = new Set<string>()
  const isBatch = body.settlements.length > 1

  for (let index = 0; index < body.settlements.length; index++) {
    const entry = body.settlements[index]
    const label = `Settlement ${index + 1}`
    if (!isObject(entry)) {
      return { success: false, error: `${label} is invalid` }
    }
    const unknownSettlementKey = Object.keys(entry).find((key) => !SETTLEMENT_KEYS.has(key))
    if (unknownSettlementKey) {
      return { success: false, error: `${label} contains an unsupported field: ${unknownSettlementKey}` }
    }
    if (!Array.from(SETTLEMENT_KEYS).every((key) => Object.prototype.hasOwnProperty.call(entry, key))) {
      return { success: false, error: `${label} is incomplete` }
    }

    const purchaseInvoiceId = entry.purchase_invoice_id
    if (typeof purchaseInvoiceId !== 'string' || !UUID_RE.test(purchaseInvoiceId)) {
      return { success: false, error: `${label} has an invalid purchase invoice` }
    }
    if (invoiceIds.has(purchaseInvoiceId)) {
      return { success: false, error: 'A purchase invoice can only appear once in a vendor payment' }
    }
    invoiceIds.add(purchaseInvoiceId)

    const expectedBalanceFils = toKwdFils(entry.expected_balance_due)
    if (expectedBalanceFils === null || expectedBalanceFils <= 0) {
      return { success: false, error: `${label} has an invalid expected invoice balance` }
    }
    const amountPaidFils = toKwdFils(entry.amount_paid)
    if (amountPaidFils === null) {
      return { success: false, error: `${label} has an invalid cash amount` }
    }
    const discountFils = toKwdFils(entry.discount_amount)
    if (discountFils === null) {
      return { success: false, error: `${label} has an invalid discount` }
    }

    const settledFils = amountPaidFils + discountFils
    if (settledFils <= 0) {
      return { success: false, error: `${label} must include cash or a discount` }
    }
    if (settledFils > expectedBalanceFils) {
      return { success: false, error: `${label} exceeds the expected invoice balance` }
    }
    if (isBatch && settledFils !== expectedBalanceFils) {
      return { success: false, error: 'Every invoice in a multi-invoice payment must be settled in full' }
    }

    settlements.push({
      purchaseInvoiceId,
      expectedBalanceDue: expectedBalanceFils / 1000,
      amountPaid: amountPaidFils / 1000,
      discountAmount: discountFils / 1000,
    })
  }

  if (typeof body.payment_date !== 'string' || !isValidISODate(body.payment_date)) {
    return { success: false, error: 'A valid payment date is required' }
  }
  if (
    typeof body.payment_mode !== 'string' ||
    !(SUPPLIER_PAYMENT_MODES as readonly string[]).includes(body.payment_mode)
  ) {
    return { success: false, error: 'Invalid payment mode' }
  }

  const referenceNumber = optionalText(body.reference_number)
  if (referenceNumber === undefined) return { success: false, error: 'Invalid reference' }
  const notes = optionalText(body.notes)
  if (notes === undefined) return { success: false, error: 'Invalid notes' }

  return {
    success: true,
    value: {
      supplierId,
      settlements,
      paymentDate: body.payment_date,
      paymentMode: body.payment_mode as SupplierPaymentMode,
      referenceNumber,
      notes,
    },
  }
}
