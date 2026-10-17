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

export type SupplierPaymentMode = typeof SUPPLIER_PAYMENT_MODES[number]

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/
const LEGACY_ALLOCATION_KEYS = [
  'purchase_order_id',
  'invoice_ids',
  'opening_payable_ids',
] as const

export type SupplierPaymentInput = {
  supplierId: string
  purchaseInvoiceId: string | null
  paymentDate: string
  amountPaid: number
  discountAmount: number
  paymentMode: SupplierPaymentMode
  referenceNumber: string | null
  notes: string | null
}

type ParsedSupplierPayment =
  | { success: true; value: SupplierPaymentInput }
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
  return Math.abs(value * 1000 - Math.round(value * 1000)) < 1e-7
}

export function parseSupplierPaymentInput(body: unknown): ParsedSupplierPayment {
  if (!isObject(body)) return { success: false, error: 'Invalid request body' }

  for (const key of LEGACY_ALLOCATION_KEYS) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      return {
        success: false,
        error: 'Use one optional purchase_invoice_id; purchase orders, opening payables, and multi-bill settlement are not supported',
      }
    }
  }

  const supplierId = body.supplier_id
  if (typeof supplierId !== 'string' || !UUID_RE.test(supplierId)) {
    return { success: false, error: 'A valid supplier is required' }
  }

  const rawInvoiceId = body.purchase_invoice_id
  const purchaseInvoiceId = rawInvoiceId === null || rawInvoiceId === undefined || rawInvoiceId === ''
    ? null
    : rawInvoiceId
  if (purchaseInvoiceId === null) {
    return { success: false, error: 'Select a purchase invoice; unallocated supplier cash must be recorded as an advance' }
  }
  if (typeof purchaseInvoiceId !== 'string' || !UUID_RE.test(purchaseInvoiceId)) {
    return { success: false, error: 'Invalid purchase invoice' }
  }

  if (typeof body.payment_date !== 'string' || !isValidISODate(body.payment_date)) {
    return { success: false, error: 'A valid payment date is required' }
  }

  if (!isValidKwdAmount(body.amount_paid)) {
    return { success: false, error: 'Amount paid must be a valid KWD amount with up to three decimal places' }
  }
  const amountPaid = Number(body.amount_paid)
  if (amountPaid < 0) return { success: false, error: 'Amount paid cannot be negative' }

  const rawDiscount = body.discount_amount ?? 0
  if (!isValidKwdAmount(rawDiscount)) {
    return { success: false, error: 'Discount must be a valid KWD amount with up to three decimal places' }
  }
  const discountAmount = Number(rawDiscount)
  if (discountAmount < 0) return { success: false, error: 'Discount cannot be negative' }
  if (!purchaseInvoiceId && discountAmount > 0) {
    return { success: false, error: 'A discount can only be recorded against a purchase invoice' }
  }
  if (!(amountPaid + discountAmount > 0)) {
    return { success: false, error: 'Cash paid or discount must be greater than zero' }
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
      purchaseInvoiceId,
      paymentDate: body.payment_date,
      amountPaid,
      discountAmount,
      paymentMode: body.payment_mode as SupplierPaymentMode,
      referenceNumber,
      notes,
    },
  }
}
