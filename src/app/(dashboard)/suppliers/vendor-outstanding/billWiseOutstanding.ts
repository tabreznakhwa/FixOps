import { readPagedRows } from './reportPaging'

export type BillWisePayable = {
  kind: 'opening' | 'invoice'
  id: string
  number: string
  date: string
  dueDate: string | null
  supplierName: string
  supplierCode: string | null
  total: number
  paid: number
  outstanding: number
  paymentStatus: string
  href: string | null
}

export type BillWiseCommitment = {
  id: string
  number: string
  date: string
  dueDate: string | null
  supplierName: string
  supplierCode: string | null
  amount: number
  href: string
}

export type BillWiseOutstanding = {
  payables: BillWisePayable[]
  commitments: BillWiseCommitment[]
  failedSources: string[]
}

// Migration 055 fields are intentionally typed locally until generated types
// are refreshed after the migration is applied.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any

type SupplierRef = {
  id?: string
  supplier_name?: string
  supplier_code?: string
} | null

type BuildOptions = {
  supplierId?: string
  from?: string
  to?: string
  q?: string
}

export async function buildBillWiseOutstanding(
  admin: Admin,
  orgId: string | undefined,
  opts: BuildOptions,
): Promise<BillWiseOutstanding> {
  const failures: string[] = []
  if (!orgId) {
    return { payables: [], commitments: [], failedSources: ['organization scope is missing'] }
  }

  const scope = <T>(query: T): T => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let scoped: any = query
    scoped = scoped.eq('organization_id', orgId)
    if (opts.supplierId) scoped = scoped.eq('supplier_id', opts.supplierId)
    return scoped as T
  }

  type OpeningRow = {
    id: string
    bill_ref: string | null
    bill_date: string
    due_date: string | null
    amount: number
    balance_due: number
    suppliers: SupplierRef
  }
  type InvoiceRow = {
    id: string
    invoice_number: string
    invoice_date: string
    due_date: string | null
    total_amount: number
    amount_paid: number
    balance_due: number
    payment_status: string
    supplier_name: string | null
    suppliers: SupplierRef
  }
  type PurchaseOrderRow = {
    id: string
    po_number: string
    purchase_date: string
    due_date: string | null
    total_amount: number
    suppliers: SupplierRef
    purchase_order_items: Array<{
      quantity: number
      quantity_received: number
      unit_cost: number
    }> | null
  }

  const [openingRows, invoiceRows, purchaseOrderRows] = await Promise.all([
    readPagedRows<OpeningRow>(
      (from, to) => {
        let query = scope(
          admin
            .from('opening_payables')
            .select('id, bill_ref, bill_date, due_date, amount, balance_due, suppliers(id, supplier_name, supplier_code)')
            .is('reversal_posting_id', null)
            .gt('balance_due', 0),
        )
        if (opts.from) query = query.gte('bill_date', opts.from)
        if (opts.to) query = query.lte('bill_date', opts.to)
        return query.order('bill_date').order('id').range(from, to)
      },
      failures,
      'opening payables',
    ),
    readPagedRows<InvoiceRow>(
      (from, to) => {
        let query = scope(
          admin
            .from('purchase_invoices')
            .select('id, invoice_number, invoice_date, due_date, total_amount, amount_paid, balance_due, payment_status, supplier_name, suppliers(id, supplier_name, supplier_code)')
            .eq('payment_type', 'credit')
            .neq('status', 'cancelled')
            .neq('payment_status', 'paid')
            .gt('balance_due', 0),
        )
        if (opts.from) query = query.gte('invoice_date', opts.from)
        if (opts.to) query = query.lte('invoice_date', opts.to)
        return query.order('invoice_date').order('id').range(from, to)
      },
      failures,
      'purchase invoices',
    ),
    readPagedRows<PurchaseOrderRow>(
      (from, to) => {
        let query = scope(
          admin
            .from('purchase_orders')
            .select('id, po_number, purchase_date, due_date, total_amount, suppliers(id, supplier_name, supplier_code), purchase_order_items(quantity, quantity_received, unit_cost)')
            .in('status', ['draft', 'submitted', 'partial']),
        )
        if (opts.from) query = query.gte('purchase_date', opts.from)
        if (opts.to) query = query.lte('purchase_date', opts.to)
        return query.order('purchase_date').order('id').range(from, to)
      },
      failures,
      'purchase orders',
    ),
  ])

  const payables: BillWisePayable[] = [
    ...openingRows.map((row): BillWisePayable => ({
      kind: 'opening',
      id: row.id,
      number: row.bill_ref ?? '—',
      date: row.bill_date,
      dueDate: row.due_date,
      supplierName: row.suppliers?.supplier_name ?? 'Unallocated',
      supplierCode: row.suppliers?.supplier_code ?? null,
      total: Number(row.amount ?? 0),
      paid: Math.max(0, Number(row.amount ?? 0) - Number(row.balance_due ?? 0)),
      outstanding: Number(row.balance_due ?? 0),
      paymentStatus: 'opening',
      href: null,
    })),
    ...invoiceRows.map((row): BillWisePayable => ({
      kind: 'invoice',
      id: row.id,
      number: row.invoice_number,
      date: row.invoice_date,
      dueDate: row.due_date,
      supplierName: row.suppliers?.supplier_name ?? row.supplier_name ?? 'Unallocated',
      supplierCode: row.suppliers?.supplier_code ?? null,
      total: Number(row.total_amount ?? 0),
      paid: Number(row.amount_paid ?? 0),
      outstanding: Number(row.balance_due ?? 0),
      paymentStatus: row.payment_status,
      href: `/inventory/purchase-invoices/${row.id}`,
    })),
  ]

  const commitments = purchaseOrderRows.flatMap((row): BillWiseCommitment[] => {
    const amount = row.purchase_order_items?.length
      ? row.purchase_order_items.reduce((sum, item) => {
          const remainingQuantity = Math.max(0, Number(item.quantity ?? 0) - Number(item.quantity_received ?? 0))
          return sum + remainingQuantity * Number(item.unit_cost ?? 0)
        }, 0)
      : Number(row.total_amount ?? 0)
    if (amount <= 0.0005) return []
    return [{
      id: row.id,
      number: row.po_number,
      date: row.purchase_date,
      dueDate: row.due_date,
      supplierName: row.suppliers?.supplier_name ?? 'Unallocated',
      supplierCode: row.suppliers?.supplier_code ?? null,
      amount,
      href: `/suppliers/po/${row.id}`,
    }]
  })

  const search = opts.q?.trim().toLowerCase()
  const matches = (number: string, supplierName: string, supplierCode: string | null) =>
    !search ||
    number.toLowerCase().includes(search) ||
    supplierName.toLowerCase().includes(search) ||
    (supplierCode ?? '').toLowerCase().includes(search)

  return {
    payables: payables
      .filter((row) => matches(row.number, row.supplierName, row.supplierCode))
      .sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number) || a.id.localeCompare(b.id)),
    commitments: commitments
      .filter((row) => matches(row.number, row.supplierName, row.supplierCode))
      .sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number) || a.id.localeCompare(b.id)),
    failedSources: failures,
  }
}
