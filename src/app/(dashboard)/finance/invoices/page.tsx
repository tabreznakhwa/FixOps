import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { RefreshButton } from '@/components/ui/RefreshButton'
import Link from 'next/link'
import { Suspense } from 'react'
import { Plus, FileText, TrendingUp, Clock, AlertCircle, CheckCircle2, Search } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { DateRangeFilter } from '@/components/ui/DateRangeFilter'
import { InvoiceSearchBar } from './InvoiceSearchBar'
import { InvoiceTableClient } from './InvoiceTableClient'

export const metadata = { title: 'Invoices' }

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; from?: string; to?: string }> }) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profileRaw } = await (supabase as any).from('users').select('role').eq('id', user!.id).single()
  const userRole = (profileRaw as { role: string } | null)?.role ?? ''
  const canEditDelete = ['owner', 'admin', 'manager'].includes(userRole)

  const hasDateFilter = Boolean(params.from || params.to || params.q)

  let query = supabase
    .from('invoices')
    .select('id, invoice_number, invoice_date, due_date, total_amount, amount_paid, balance_due, status, invoice_type, notes, customers(full_name, mobile_number)')
    .order('created_at', { ascending: false })

  if (params.status) query = query.eq('status', params.status)
  if (params.from) query = query.gte('invoice_date', params.from)
  if (params.to) query = query.lte('invoice_date', params.to)

  if (params.q) {
    const q = params.q.trim()
    // Find customers whose name matches so we can include their invoices
    const { data: matchedCustomers } = await supabase
      .from('customers')
      .select('id')
      .ilike('full_name', `%${q}%`)
    const customerIds = (matchedCustomers ?? []).map((c: { id: string }) => c.id)

    if (customerIds.length > 0) {
      query = query.or(
        `invoice_number.ilike.%${q}%,ref_number.ilike.%${q}%,customer_id.in.(${customerIds.join(',')})`,
      )
    } else {
      query = query.or(`invoice_number.ilike.%${q}%,ref_number.ilike.%${q}%`)
    }
  }

  const { data: invoicesRaw } = await query.limit(hasDateFilter ? 1000 : 50)
  const invoices = invoicesRaw as unknown as Array<{
    id: string; invoice_number: string; invoice_date: string; due_date: string | null;
    total_amount: number; amount_paid: number; balance_due: number; status: string;
    invoice_type: string; notes: string | null; customers: { full_name: string; mobile_number: string } | null
  }>

  // Summary stats
  const { data: allInvoicesRaw } = await supabase
    .from('invoices')
    .select('total_amount, amount_paid, balance_due, status')
    .not('status', 'in', '(cancelled,written_off)')
  const allInvoices = allInvoicesRaw as unknown as { total_amount: number; amount_paid: number; balance_due: number; status: string }[]

  const totalInvoiced = allInvoices?.reduce((s, i) => s + i.total_amount, 0) ?? 0
  const totalCollected = allInvoices?.reduce((s, i) => s + i.amount_paid, 0) ?? 0
  const totalPending = allInvoices?.reduce((s, i) => s + i.balance_due, 0) ?? 0
  const overdueCount = allInvoices?.filter((i) => i.status === 'overdue').length ?? 0

  return (
    <div className="animate-fade-in">
      <Header
        title="Invoices"
        subtitle="Billing and revenue tracking"
        actions={
          <div className="flex items-center gap-2">
            <RefreshButton />
            <Suspense fallback={<div className="w-64 h-9 bg-slate-100 rounded-lg animate-pulse" />}>
              <InvoiceSearchBar />
            </Suspense>
            {canEditDelete && (
              <Link
                href="/finance/invoices/merge"
                className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-200 transition-colors"
              >
                Monthly Invoice
              </Link>
            )}
            <Link
              href="/finance/invoices/new"
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" /> New Invoice
            </Link>
          </div>
        }
      />

      <div className="p-6 space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total Invoiced', value: formatCurrency(totalInvoiced), icon: TrendingUp, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: 'Total Collected', value: formatCurrency(totalCollected), icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50' },
            { label: 'Outstanding', value: formatCurrency(totalPending), icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
            { label: 'Overdue Invoices', value: overdueCount, icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50' },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className={`w-8 h-8 ${bg} rounded-lg flex items-center justify-center mb-3`}>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
              <p className="text-xl font-bold text-slate-900">{value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Status Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[
            { label: 'All', value: '' },
            { label: 'Draft', value: 'draft' },
            { label: 'Issued', value: 'issued' },
            { label: 'Partial', value: 'partial' },
            { label: 'Overdue', value: 'overdue' },
            { label: 'Paid', value: 'paid' },
            { label: 'Cancelled', value: 'cancelled' },
          ].map(({ label, value }) => {
            const qs = [value ? `status=${value}` : '', params.from ? `from=${params.from}` : '', params.to ? `to=${params.to}` : '']
              .filter(Boolean).join('&')
            return (
              <Link
                key={label}
                href={qs ? `/finance/invoices?${qs}` : '/finance/invoices'}
                className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                  params.status === value || (!params.status && !value) ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {label}
              </Link>
            )
          })}
        </div>

        {/* Date Filter */}
        <DateRangeFilter basePath="/finance/invoices" from={params.from} to={params.to} />

        {/* Active search indicator */}
        {params.q && (
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Search className="w-4 h-4 text-slate-400" />
            <span>Results for <span className="font-semibold text-slate-900">"{params.q}"</span></span>
            <Link
              href={`/finance/invoices${params.status ? `?status=${params.status}` : ''}`}
              className="text-blue-500 hover:text-blue-700 text-xs underline"
            >
              Clear
            </Link>
          </div>
        )}

        {/* Invoice Table */}
        {!invoices?.length ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No invoices found</p>
          </div>
        ) : (
          <InvoiceTableClient invoices={invoices} canEditDelete={canEditDelete} />
        )}
      </div>
    </div>
  )
}
