/**
 * Aggregates the last N months of trading into a compact metrics object.
 *
 * Everything the AI advisor sees comes from here. Two consequences shape the
 * design:
 *
 *  1. No personal data leaves the server. Customer and supplier names stay out
 *     of the summary entirely — the AI reasons over totals and trends, and the
 *     UI shows the named lists alongside it, computed locally. That keeps
 *     business contacts out of a third-party API without losing usefulness.
 *
 *  2. Silent query failures would produce confidently wrong advice, which is
 *     worse than no advice. Every source records into `failedSources` so the
 *     page can warn instead of quietly under-reporting revenue.
 */

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

/** Item unmoved for this long (with stock on hand) counts as dead capital. */
const DEAD_STOCK_DAYS = 90

export interface MonthMetrics {
  key: string            // 2026-07
  label: string          // Jul 2026
  revenue: number        // invoiced, excluding cancelled
  collected: number      // cash actually received
  cogs: number           // stock issued to jobs, at cost
  expenses: number
  purchases: number
  payroll: number
  invoiceCount: number
  avgInvoiceValue: number
  grossProfit: number    // revenue - cogs
  netProfit: number      // revenue - cogs - expenses - payroll
}

export interface StockItem {
  id: string
  itemCode: string
  itemName: string
  currentStock: number
  minimumLevel: number
  value: number
  lastIssuedAt: string | null
  daysSinceIssue: number | null
}

export interface BusinessMetrics {
  generatedAt: string
  periodFrom: string
  periodTo: string
  months: MonthMetrics[]
  totals: {
    revenue: number
    collected: number
    expenses: number
    purchases: number
    payroll: number
    grossProfit: number
    netProfit: number
  }
  receivables: {
    total: number
    current: number
    days30: number
    days60: number
    days90plus: number
    overdueInvoiceCount: number
  }
  stock: {
    totalValue: number
    activeItems: number
    deadStockValue: number
    deadStock: StockItem[]
    belowMinimum: StockItem[]
    fastMoving: { itemName: string; qtyIssued: number; value: number }[]
    turnoverRatio: number | null   // annualised COGS / stock value
  }
  expenseByCategory: { category: string; amount: number; pctOfRevenue: number }[]
  revenueByType: { type: string; amount: number }[]
  operations: {
    workOrdersCompleted: number
    workOrdersCancelled: number
    quotationsSent: number
    quotationsConverted: number
    quotationConversionPct: number | null
  }
  failedSources: string[]
}

type Admin = { from: (t: string) => any }

/** Runs a query, recording rather than swallowing failure. */
async function safeRows<T = any>(
  label: string,
  failures: string[],
  run: () => Promise<{ data: unknown; error: unknown }>
): Promise<T[]> {
  try {
    const { data, error } = await run()
    if (error) {
      failures.push(label)
      return []
    }
    return (data ?? []) as T[]
  } catch {
    failures.push(label)
    return []
  }
}

const num = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0)
const monthKey = (iso: string) => iso.slice(0, 7)

function daysBetween(from: string, to: Date) {
  const d = new Date(`${from}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return null
  return Math.floor((to.getTime() - d.getTime()) / 86_400_000)
}

export async function buildBusinessMetrics(
  admin: Admin,
  orgId: string,
  opts: { months?: number } = {}
): Promise<BusinessMetrics> {
  const monthCount = opts.months ?? 6
  const failures: string[] = []

  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kuwait' }))
  const today = now.toISOString().slice(0, 10)

  // Window covers `monthCount` months including the current (partial) one.
  const start = new Date(Date.UTC(now.getFullYear(), now.getMonth() - (monthCount - 1), 1))
  const periodFrom = start.toISOString().slice(0, 10)

  const monthKeys: { key: string; label: string }[] = []
  for (let i = 0; i < monthCount; i++) {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1))
    monthKeys.push({
      key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`,
      label: `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`,
    })
  }

  const [
    invoices, payments, expenses, purchases, salarySlips,
    stockTxns, items, openInvoices, workOrders, quotations,
  ] = await Promise.all([
    safeRows('invoices', failures, () =>
      admin.from('invoices')
        .select('invoice_date, total_amount, invoice_type, status')
        .eq('organization_id', orgId).gte('invoice_date', periodFrom).limit(5000)),

    safeRows('payments', failures, () =>
      admin.from('payments')
        .select('payment_date, amount_received')
        .eq('organization_id', orgId).eq('is_cancelled', false)
        .gte('payment_date', periodFrom).limit(5000)),

    safeRows('expenses', failures, () =>
      admin.from('expenses')
        .select('expense_date, amount, category')
        .eq('organization_id', orgId).gte('expense_date', periodFrom).limit(5000)),

    safeRows('purchase_invoices', failures, () =>
      admin.from('purchase_invoices')
        .select('invoice_date, total_amount, status')
        .eq('organization_id', orgId).gte('invoice_date', periodFrom).limit(5000)),

    safeRows('salary_slips', failures, () =>
      admin.from('salary_slips')
        .select('net_salary, salary_runs(salary_month, salary_year)')
        .eq('organization_id', orgId).limit(5000)),

    safeRows('inventory_transactions', failures, () =>
      admin.from('inventory_transactions')
        .select('item_id, transaction_type, quantity, total_cost, created_at')
        .eq('organization_id', orgId).limit(10000)),

    safeRows('inventory_items', failures, () =>
      admin.from('inventory_items')
        .select('id, item_code, item_name, current_stock, minimum_stock_level, purchase_price')
        .eq('organization_id', orgId).eq('is_active', true).limit(5000)),

    // Aging is an as-of-today view, so it is not restricted to the trend window.
    safeRows('open_invoices', failures, () =>
      admin.from('invoices')
        .select('invoice_date, due_date, balance_due, status')
        .eq('organization_id', orgId).neq('status', 'cancelled').gt('balance_due', 0).limit(5000)),

    safeRows('work_orders', failures, () =>
      admin.from('work_orders')
        .select('status, created_at')
        .eq('organization_id', orgId).limit(5000)),

    safeRows('quotations', failures, () =>
      admin.from('quotations')
        .select('status, created_at')
        .eq('organization_id', orgId).limit(5000)),
  ])

  // ---- monthly series -----------------------------------------------------
  const blank = (): Omit<MonthMetrics, 'key' | 'label'> => ({
    revenue: 0, collected: 0, cogs: 0, expenses: 0, purchases: 0, payroll: 0,
    invoiceCount: 0, avgInvoiceValue: 0, grossProfit: 0, netProfit: 0,
  })
  const acc = new Map(monthKeys.map(m => [m.key, blank()]))
  const bump = (key: string, fn: (m: ReturnType<typeof blank>) => void) => {
    const row = acc.get(key)
    if (row) fn(row)
  }

  const revenueByType = new Map<string, number>()
  for (const inv of invoices) {
    if (inv.status === 'cancelled' || !inv.invoice_date) continue
    const amt = num(inv.total_amount)
    bump(monthKey(inv.invoice_date), m => { m.revenue += amt; m.invoiceCount += 1 })
    const t = inv.invoice_type ?? 'service'
    revenueByType.set(t, (revenueByType.get(t) ?? 0) + amt)
  }

  for (const p of payments) {
    if (p.payment_date) bump(monthKey(p.payment_date), m => { m.collected += num(p.amount_received) })
  }

  const expenseByCat = new Map<string, number>()
  for (const e of expenses) {
    if (!e.expense_date) continue
    const amt = num(e.amount)
    bump(monthKey(e.expense_date), m => { m.expenses += amt })
    const c = e.category ?? 'other'
    expenseByCat.set(c, (expenseByCat.get(c) ?? 0) + amt)
  }

  for (const p of purchases) {
    if (p.status === 'cancelled' || !p.invoice_date) continue
    bump(monthKey(p.invoice_date), m => { m.purchases += num(p.total_amount) })
  }

  for (const slip of salarySlips) {
    const run = slip.salary_runs as { salary_month: number; salary_year: number } | null
    if (!run) continue
    const key = `${run.salary_year}-${String(run.salary_month).padStart(2, '0')}`
    bump(key, m => { m.payroll += num(slip.net_salary) })
  }

  // Stock issued to jobs is the closest thing to true COGS in this schema.
  const lastIssued = new Map<string, string>()
  const issuedQty = new Map<string, { qty: number; value: number }>()
  for (const t of stockTxns) {
    if (t.transaction_type !== 'issued' || !t.created_at) continue
    const day = String(t.created_at).slice(0, 10)
    if (day >= periodFrom) {
      bump(monthKey(day), m => { m.cogs += Math.abs(num(t.total_cost)) })
      const cur = issuedQty.get(t.item_id) ?? { qty: 0, value: 0 }
      cur.qty += Math.abs(num(t.quantity))
      cur.value += Math.abs(num(t.total_cost))
      issuedQty.set(t.item_id, cur)
    }
    const prev = lastIssued.get(t.item_id)
    if (!prev || day > prev) lastIssued.set(t.item_id, day)
  }

  const months: MonthMetrics[] = monthKeys.map(({ key, label }) => {
    const m = acc.get(key)!
    return {
      key, label, ...m,
      avgInvoiceValue: m.invoiceCount > 0 ? m.revenue / m.invoiceCount : 0,
      grossProfit: m.revenue - m.cogs,
      netProfit: m.revenue - m.cogs - m.expenses - m.payroll,
    }
  })

  const sum = (f: (m: MonthMetrics) => number) => months.reduce((s, m) => s + f(m), 0)
  const totals = {
    revenue: sum(m => m.revenue),
    collected: sum(m => m.collected),
    expenses: sum(m => m.expenses),
    purchases: sum(m => m.purchases),
    payroll: sum(m => m.payroll),
    grossProfit: sum(m => m.grossProfit),
    netProfit: sum(m => m.netProfit),
  }

  // ---- receivables aging --------------------------------------------------
  const aging = { total: 0, current: 0, days30: 0, days60: 0, days90plus: 0, overdueInvoiceCount: 0 }
  for (const inv of openInvoices) {
    const bal = num(inv.balance_due)
    if (bal <= 0) continue
    aging.total += bal
    const ref = inv.due_date ?? inv.invoice_date
    const age = ref ? daysBetween(ref, now) : null
    if (age === null || age <= 0) { aging.current += bal; continue }
    aging.overdueInvoiceCount += 1
    if (age <= 30) aging.days30 += bal
    else if (age <= 60) aging.days60 += bal
    else if (age <= 90) aging.days90plus += bal
    else aging.days90plus += bal
  }

  // ---- stock governance ---------------------------------------------------
  const stockItems: StockItem[] = items.map(it => {
    const qty = num(it.current_stock)
    const last = lastIssued.get(it.id) ?? null
    return {
      id: it.id,
      itemCode: it.item_code,
      itemName: it.item_name,
      currentStock: qty,
      minimumLevel: num(it.minimum_stock_level),
      value: qty * num(it.purchase_price),
      lastIssuedAt: last,
      daysSinceIssue: last ? daysBetween(last, now) : null,
    }
  })

  const totalStockValue = stockItems.reduce((s, i) => s + i.value, 0)
  const deadStock = stockItems
    .filter(i => i.currentStock > 0 && (i.daysSinceIssue === null || i.daysSinceIssue > DEAD_STOCK_DAYS))
    .sort((a, b) => b.value - a.value)
  const belowMinimum = stockItems
    .filter(i => i.minimumLevel > 0 && i.currentStock < i.minimumLevel)
    .sort((a, b) => (a.currentStock - a.minimumLevel) - (b.currentStock - b.minimumLevel))

  const fastMoving = [...issuedQty.entries()]
    .map(([id, v]) => {
      const it = stockItems.find(s => s.id === id)
      return { itemName: it?.itemName ?? 'Unknown item', qtyIssued: v.qty, value: v.value }
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, 10)

  const cogsTotal = sum(m => m.cogs)
  const annualisedCogs = monthCount > 0 ? (cogsTotal / monthCount) * 12 : 0
  const turnoverRatio = totalStockValue > 0 ? annualisedCogs / totalStockValue : null

  // ---- operations ---------------------------------------------------------
  const inWindow = (ts: unknown) => typeof ts === 'string' && ts.slice(0, 10) >= periodFrom
  const woCompleted = workOrders.filter(w => inWindow(w.created_at) && ['completed', 'invoiced', 'paid'].includes(w.status)).length
  const woCancelled = workOrders.filter(w => inWindow(w.created_at) && w.status === 'cancelled').length
  const qSent = quotations.filter(q => inWindow(q.created_at)).length
  const qConverted = quotations.filter(q => inWindow(q.created_at) && ['accepted', 'invoiced', 'converted'].includes(q.status)).length

  return {
    generatedAt: new Date().toISOString(),
    periodFrom,
    periodTo: today,
    months,
    totals,
    receivables: aging,
    stock: {
      totalValue: totalStockValue,
      activeItems: stockItems.length,
      deadStockValue: deadStock.reduce((s, i) => s + i.value, 0),
      deadStock: deadStock.slice(0, 15),
      belowMinimum: belowMinimum.slice(0, 15),
      fastMoving,
      turnoverRatio,
    },
    expenseByCategory: [...expenseByCat.entries()]
      .map(([category, amount]) => ({
        category,
        amount,
        pctOfRevenue: totals.revenue > 0 ? (amount / totals.revenue) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount),
    revenueByType: [...revenueByType.entries()]
      .map(([type, amount]) => ({ type, amount }))
      .sort((a, b) => b.amount - a.amount),
    operations: {
      workOrdersCompleted: woCompleted,
      workOrdersCancelled: woCancelled,
      quotationsSent: qSent,
      quotationsConverted: qConverted,
      quotationConversionPct: qSent > 0 ? (qConverted / qSent) * 100 : null,
    },
    failedSources: failures,
  }
}

/**
 * Renders metrics as compact text for the model.
 *
 * Deliberately contains no customer, supplier or staff names — only item names
 * (needed for stock advice to be actionable) and numbers.
 */
export function metricsToPrompt(m: BusinessMetrics): string {
  const kwd = (n: number) => n.toFixed(3)
  const L: string[] = []

  L.push(`PERIOD: ${m.periodFrom} to ${m.periodTo} (currency: KWD)`)
  L.push('')
  L.push('MONTHLY TRADING')
  L.push('month | revenue | collected | cogs | expenses | payroll | gross profit | net profit | invoices')
  for (const x of m.months) {
    L.push([
      x.label, kwd(x.revenue), kwd(x.collected), kwd(x.cogs), kwd(x.expenses),
      kwd(x.payroll), kwd(x.grossProfit), kwd(x.netProfit), String(x.invoiceCount),
    ].join(' | '))
  }

  L.push('')
  L.push('PERIOD TOTALS')
  L.push(`revenue=${kwd(m.totals.revenue)} collected=${kwd(m.totals.collected)} expenses=${kwd(m.totals.expenses)} purchases=${kwd(m.totals.purchases)} payroll=${kwd(m.totals.payroll)} grossProfit=${kwd(m.totals.grossProfit)} netProfit=${kwd(m.totals.netProfit)}`)

  L.push('')
  L.push('RECEIVABLES (as of today)')
  L.push(`total=${kwd(m.receivables.total)} notYetDue=${kwd(m.receivables.current)} 1-30d=${kwd(m.receivables.days30)} 31-60d=${kwd(m.receivables.days60)} 60d+=${kwd(m.receivables.days90plus)} overdueInvoices=${m.receivables.overdueInvoiceCount}`)

  L.push('')
  L.push('STOCK')
  L.push(`totalValue=${kwd(m.stock.totalValue)} activeItems=${m.stock.activeItems} deadStockValue=${kwd(m.stock.deadStockValue)} annualTurnoverRatio=${m.stock.turnoverRatio?.toFixed(2) ?? 'n/a'}`)
  if (m.stock.deadStock.length) {
    L.push(`unmoved >${DEAD_STOCK_DAYS}d (top by tied-up value):`)
    for (const d of m.stock.deadStock.slice(0, 10)) {
      L.push(`  ${d.itemName}: qty=${d.currentStock} value=${kwd(d.value)} lastIssued=${d.lastIssuedAt ?? 'never'}`)
    }
  }
  if (m.stock.belowMinimum.length) {
    L.push('below minimum level:')
    for (const b of m.stock.belowMinimum.slice(0, 10)) {
      L.push(`  ${b.itemName}: onHand=${b.currentStock} minimum=${b.minimumLevel}`)
    }
  }
  if (m.stock.fastMoving.length) {
    L.push('fastest moving (by cost issued):')
    for (const f of m.stock.fastMoving.slice(0, 8)) {
      L.push(`  ${f.itemName}: qty=${f.qtyIssued} value=${kwd(f.value)}`)
    }
  }

  L.push('')
  L.push('EXPENSES BY CATEGORY')
  for (const e of m.expenseByCategory.slice(0, 12)) {
    L.push(`  ${e.category}: ${kwd(e.amount)} (${e.pctOfRevenue.toFixed(1)}% of revenue)`)
  }

  L.push('')
  L.push('REVENUE BY TYPE')
  for (const r of m.revenueByType) L.push(`  ${r.type}: ${kwd(r.amount)}`)

  L.push('')
  L.push('OPERATIONS')
  L.push(`workOrdersCompleted=${m.operations.workOrdersCompleted} workOrdersCancelled=${m.operations.workOrdersCancelled} quotationsSent=${m.operations.quotationsSent} quotationsConverted=${m.operations.quotationsConverted} conversionPct=${m.operations.quotationConversionPct?.toFixed(1) ?? 'n/a'}`)

  if (m.failedSources.length) {
    L.push('')
    L.push(`WARNING: these data sources failed to load and are missing from the figures above: ${m.failedSources.join(', ')}. Say so in your answer and avoid conclusions that depend on them.`)
  }

  return L.join('\n')
}
