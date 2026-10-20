import { isValidISODate, isValidMoney } from '@/lib/assets'

export const CUSTOMER_PAYMENT_MODES = [
  'cash',
  'bank_transfer',
  'card',
  'pos',
  'cheque',
  'online',
  'knet',
  'other',
] as const

export type CustomerPaymentMode = typeof CUSTOMER_PAYMENT_MODES[number]

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/

export type CustomerPaymentInput = {
  customerId: string
  invoiceId: string | null
  paymentDate: string
  amountReceived: number
  discountAmount: number
  paymentMode: CustomerPaymentMode
  referenceNumber: string | null
  notes: string | null
  isAdvance: boolean
}

type ParsedCustomerPayment =
  | { success: true; value: CustomerPaymentInput }
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
  return Math.abs(value * 1000 - Math.round(value * 1000)) < 1e-7
}

function toFils(value: unknown): number | null {
  if (!isValidKwdAmount(value)) return null
  const amount = Number(value)
  if (amount < 0) return null
  return Math.round(amount * 1000)
}

export function calculateInvoiceSettlement(
  balanceDue: unknown,
  discountAmount: unknown,
  cashAmount?: unknown,
): ParsedInvoiceSettlement {
  const balanceFils = toFils(balanceDue)
  if (balanceFils === null || balanceFils <= 0) {
    return { success: false, error: 'Invoice balance must be greater than zero' }
  }

  const normalizedDiscount = discountAmount === '' || discountAmount === null || discountAmount === undefined
    ? 0
    : discountAmount
  const discountFils = toFils(normalizedDiscount)
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
    : toFils(cashAmount)
  if (cashFils === null) {
    return {
      success: false,
      error: 'Cash received must be a valid KWD amount with up to three decimal places',
    }
  }

  const settlementFils = cashFils + discountFils
  if (settlementFils <= 0) {
    return { success: false, error: 'Cash received or discount must be greater than zero' }
  }
  if (settlementFils > balanceFils) {
    return { success: false, error: 'Cash received plus discount cannot exceed the invoice balance' }
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

export function parseCustomerPaymentInput(body: unknown): ParsedCustomerPayment {
  if (!isObject(body)) return { success: false, error: 'Invalid request body' }

  const customerId = body.customer_id
  if (typeof customerId !== 'string' || !UUID_RE.test(customerId)) {
    return { success: false, error: 'A valid customer is required' }
  }

  const rawInvoiceId = body.invoice_id
  const invoiceId = rawInvoiceId === null || rawInvoiceId === undefined || rawInvoiceId === ''
    ? null
    : rawInvoiceId
  if (invoiceId !== null && (typeof invoiceId !== 'string' || !UUID_RE.test(invoiceId))) {
    return { success: false, error: 'Invalid invoice' }
  }

  if (typeof body.payment_date !== 'string' || !isValidISODate(body.payment_date)) {
    return { success: false, error: 'A valid payment date is required' }
  }

  if (!isValidKwdAmount(body.amount_received)) {
    return {
      success: false,
      error: 'Amount received must be a valid KWD amount with up to three decimal places',
    }
  }
  const amountReceived = Number(body.amount_received)
  if (amountReceived < 0) {
    return { success: false, error: 'Amount received cannot be negative' }
  }

  const rawDiscount = body.discount_amount ?? 0
  if (!isValidKwdAmount(rawDiscount)) {
    return {
      success: false,
      error: 'Discount must be a valid KWD amount with up to three decimal places',
    }
  }
  const discountAmount = Number(rawDiscount)
  if (discountAmount < 0) {
    return { success: false, error: 'Discount cannot be negative' }
  }

  if (typeof body.is_advance !== 'boolean') {
    return { success: false, error: 'Invalid advance payment flag' }
  }
  const isAdvance = body.is_advance
  if (isAdvance && invoiceId) {
    return { success: false, error: 'Advance payments cannot be linked to an invoice' }
  }
  if (discountAmount > 0 && !invoiceId) {
    return { success: false, error: 'A discount can only be recorded against an invoice' }
  }
  if (isAdvance && discountAmount > 0) {
    return { success: false, error: 'Advance payments cannot include a discount' }
  }
  if (!(amountReceived + discountAmount > 0)) {
    return { success: false, error: 'Cash received or discount must be greater than zero' }
  }

  if (
    typeof body.payment_mode !== 'string' ||
    !(CUSTOMER_PAYMENT_MODES as readonly string[]).includes(body.payment_mode)
  ) {
    return { success: false, error: 'Invalid payment mode' }
  }

  const referenceNumber = optionalText(body.reference_number)
  if (referenceNumber === undefined) {
    return { success: false, error: 'Invalid reference number' }
  }
  const notes = optionalText(body.notes)
  if (notes === undefined) return { success: false, error: 'Invalid notes' }

  return {
    success: true,
    value: {
      customerId,
      invoiceId: invoiceId as string | null,
      paymentDate: body.payment_date,
      amountReceived,
      discountAmount,
      paymentMode: body.payment_mode as CustomerPaymentMode,
      referenceNumber,
      notes,
      isAdvance,
    },
  }
}
