import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { formatCurrency } from '@/lib/utils'
import { AlertTriangle, TrendingDown, Clock, Users } from 'lucide-react'
import Link from 'next/link'
import { ReceivablesClient } from './ReceivablesClient'
import {
  resolveReceivableSort,
  sortReceivableRows,
  type ReceivableRow,
} from './receivablesSort'
import {
  fetchAllOpeningReceivables,
  fetchAllReceivableInvoices,
} from './receivables.server'
import { currentPath, withReturnTo } from '@/lib/backNav'
import { kuwaitISODate } from '@/lib/attendance'
import { buildReceivableAging } from './receivablesAging'
import { getAuthedProfile } from '@/lib/auth/session'
import { getRoleAccess } from '@/lib/orgPermissions'

export const metadata = { title: 'Receivables' }

export default async function ReceivablesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const { sort, direction } = resolveReceivableSort(params.sort, params.dir)
  const canonicalParams = { ...params, sort, dir: direction }
  const receivablesPath = currentPath('/finance/receivables', canonicalParams)
  const supabase = await createClient()
  const { profile } = await getAuthedProfile()
  if (!profile?.organization_id || profile.status !== 'active') redirect('/login')
  const financeAccess = await getRoleAccess(profile.organization_id, profile.role)
  if (financeAccess.finance === 'none') redirect('/dashboard?error=unauthorized')

  const [invoiceResult, openingResult] = await Promise.all([
    fetchAllReceivableInvoices(supabase),
    fetchAllOpeningReceivables(supabase),
  ])
  const receivables = invoiceResult.rows
  const openingReceivables = openingResult.rows
  const failedSources = [invoiceResult.error, openingResult.error].filter(
    (error): error is string => Boolean(error),
  )

  // Group by customer. Customer rank always follows total outstanding balance;
  // the URL-backed sort applies only within each customer's rows.
  const customerMap: Record<string, {
    customer_id: string; full_name: string; mobile_number: string; area: string | null
    total_balance: number
    invoices: ReceivableRow[]
  }> = {}

  receivables.forEach((inv) => {
    const customer = inv.customers
    if (!customer) return
    if (!customerMap[inv.customer_id]) {
      customerMap[inv.customer_id] = { customer_id: inv.customer_id, full_name: customer.full_name, mobile_number: customer.mobile_number, area: customer.area, total_balance: 0, invoices: [] }
    }
    customerMap[inv.customer_id].total_balance += inv.balance_due
    customerMap[inv.customer_id].invoices.push({
      rowKey: `invoice:${inv.id}`,
      invoiceId: inv.id,
      source: 'invoice',
      invoice_number: inv.invoice_number,
      balance_due: inv.balance_due,
      due_date: inv.due_date,
      status: inv.status,
      invoice_date: inv.invoice_date,
    })
  })

  openingReceivables.forEach((op) => {
    const customer = op.customers
    if (!customer) return
    if (!customerMap[op.customer_id]) {
      customerMap[op.customer_id] = { customer_id: op.customer_id, full_name: customer.full_name, mobile_number: customer.mobile_number, area: customer.area, total_balance: 0, invoices: [] }
    }
    customerMap[op.customer_id].total_balance += op.balance_due
    customerMap[op.customer_id].invoices.push({
      rowKey: `opening:${op.id}`,
      invoiceId: null,
      source: 'opening',
      invoice_number: op.invoice_ref ?? 'Opening',
      balance_due: op.balance_due,
      due_date: op.due_date,
      status: 'opening',
      invoice_date: op.invoice_date,
    })
  })

  const customers = Object.values(customerMap)
    .map(customer => ({
      ...customer,
      invoices: sortReceivableRows(customer.invoices, sort, direction),
    }))
    .sort((a, b) => {
      const balanceComparison = b.total_balance - a.total_balance
      return balanceComparison || a.customer_id.localeCompare(b.customer_id)
    })

  // Aging follows Kuwait calendar dates rather than elapsed UTC hours.
  const aging = buildReceivableAging([
    ...receivables.map(i => ({ balance_due: i.balance_due, due_date: i.due_date })),
    ...openingReceivables.map(i => ({ balance_due: i.balance_due, due_date: i.due_date })),
  ], kuwaitISODate())

  const totalReceivables = customers.reduce((s, c) => s + c.total_balance, 0)

  return (
    <div className="animate-fade-in">
      <Header title="Receivables" subtitle="Outstanding customer balances"
        actions={
          <Link href={withReturnTo('/finance/opening-receivables', receivablesPath)} className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition-colors">
            Opening Receivables
          </Link>
        }
      />

      <div className="p-6 space-y-6">
        {failedSources.length > 0 && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold">Receivables are incomplete</p>
                <p className="mt-0.5 text-xs">
                  {failedSources.join('; ')}. Totals and aging below should not be relied on until the data reloads successfully.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Total + Aging */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl p-5 text-white">
            <div className="flex items-center gap-2 mb-2">
              <TrendingDown className="w-5 h-5 opacity-80" />
              <span className="text-sm font-medium opacity-80">Total Outstanding</span>
            </div>
            <p className="text-3xl font-bold">{formatCurrency(totalReceivables)}</p>
            <p className="text-sm opacity-70 mt-1">{customers.length} customers with balances</p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-500" /> Aging Analysis
            </p>
            <div className="space-y-2">
              {[
                { label: 'Current (not due)', value: aging.current, color: 'bg-green-500' },
                { label: '1–30 days overdue', value: aging['30'], color: 'bg-yellow-500' },
                { label: '31–60 days overdue', value: aging['60'], color: 'bg-orange-500' },
                { label: '61+ days overdue', value: aging['90+'], color: 'bg-red-500' },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex items-center gap-3">
                  <div className={`w-2.5 h-2.5 rounded-full ${color} flex-shrink-0`} />
                  <span className="text-xs text-slate-600 flex-1">{label}</span>
                  <span className="text-xs font-bold text-slate-900">{formatCurrency(value)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Customer Receivables */}
        {customers.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No outstanding receivables</p>
            <p className="text-slate-400 text-sm">All invoices are paid up!</p>
          </div>
        ) : (
          <ReceivablesClient
            customers={customers}
            sort={sort}
            direction={direction}
          />
        )}
      </div>
    </div>
  )
}
