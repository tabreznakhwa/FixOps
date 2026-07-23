import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { FileText, Plus, Search, Clock, CheckCircle2, XCircle, Send, RefreshCw } from 'lucide-react'
import { DateRangeFilter } from '@/components/ui/DateRangeFilter'
import { SearchBar } from '@/components/ui/SearchBar'
import { formatCurrency, formatDate, formatStatus, getStatusColor } from '@/lib/utils'

export const metadata = { title: 'Quotations' }

const statusIcons: Record<string, React.ReactNode> = {
  draft: <FileText className="w-3.5 h-3.5" />,
  sent: <Send className="w-3.5 h-3.5" />,
  approved: <CheckCircle2 className="w-3.5 h-3.5" />,
  rejected: <XCircle className="w-3.5 h-3.5" />,
  expired: <Clock className="w-3.5 h-3.5" />,
  converted: <RefreshCw className="w-3.5 h-3.5" />,
}

export default async function QuotationsPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; from?: string; to?: string }> }) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profileRaw } = user
    ? await supabase.from('users').select('role').eq('id', user.id).single()
    : { data: null }
  const role = (profileRaw as { role: string } | null)?.role ?? ''
  if (!['owner', 'admin'].includes(role)) redirect('/dashboard?error=unauthorized')

  let query = supabase
    .from('quotations')
    .select('id, quotation_number, quotation_date, valid_until, total_amount, status, notes, customers(full_name, mobile_number)')
    .order('created_at', { ascending: false })

  if (params.status) query = query.eq('status', params.status)
  if (params.from) query = query.gte('quotation_date', params.from)
  if (params.to) query = query.lte('quotation_date', params.to)

  if (params.q) {
    const q = params.q.trim()
    const { data: matchedCustomers } = await supabase.from('customers').select('id').ilike('full_name', `%${q}%`)
    const customerIds = (matchedCustomers ?? []).map((c: { id: string }) => c.id)
    if (customerIds.length > 0) query = query.or(`quotation_number.ilike.%${q}%,customer_id.in.(${customerIds.join(',')})`)
    else query = query.or(`quotation_number.ilike.%${q}%`)
  }

  const { data: quotationsRaw } = await query.limit(params.from || params.to || params.q ? 1000 : 50)
  const quotations = (quotationsRaw ?? []) as unknown as Array<{
    id: string
    quotation_number: string
    quotation_date: string
    valid_until: string | null
    total_amount: number
    status: string
    notes: string | null
    customers: { full_name: string; mobile_number: string | null } | null
  }>

  const { data: allRaw } = await supabase.from('quotations').select('total_amount, status').not('status', 'in', '(rejected)')
  const all = (allRaw ?? []) as unknown as { total_amount: number; status: string }[]
  const totalQuoted = all.reduce((sum, q) => sum + Number(q.total_amount), 0)
  const pendingCount = all.filter(q => ['draft', 'sent'].includes(q.status)).length
  const approvedCount = all.filter(q => q.status === 'approved').length
  const convertedCount = all.filter(q => q.status === 'converted').length

  return (
    <div className="animate-fade-in">
      <Header
        title="Quotations"
        subtitle="Customer estimates and approvals"
        actions={
          <div className="flex items-center gap-2">
            <Suspense fallback={<div className="w-60 h-9 bg-slate-100 rounded-lg animate-pulse" />}>
              <SearchBar basePath="/finance/quotations" placeholder="Search quotation, customer…" />
            </Suspense>
            <Link href="/finance/quotations/new" className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors">
              <Plus className="w-4 h-4" /> New Quotation
            </Link>
          </div>
        }
      />

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total Quoted', value: formatCurrency(totalQuoted), icon: FileText, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: 'Pending', value: pendingCount, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
            { label: 'Approved', value: approvedCount, icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50' },
            { label: 'Converted', value: convertedCount, icon: RefreshCw, color: 'text-indigo-600', bg: 'bg-indigo-50' },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className={`w-8 h-8 ${bg} rounded-lg flex items-center justify-center mb-3`}><Icon className={`w-4 h-4 ${color}`} /></div>
              <p className="text-xl font-bold text-slate-900">{value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {['', 'draft', 'sent', 'approved', 'rejected', 'expired', 'converted'].map((s) => {
            const qs = [s ? `status=${s}` : '', params.from ? `from=${params.from}` : '', params.to ? `to=${params.to}` : ''].filter(Boolean).join('&')
            return (
              <Link key={s || 'all'} href={qs ? `/finance/quotations?${qs}` : '/finance/quotations'} className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${params.status === s || (!params.status && !s) ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                {s ? formatStatus(s) : 'All'}
              </Link>
            )
          })}
        </div>

        <DateRangeFilter basePath="/finance/quotations" from={params.from} to={params.to} label="Quotation Date" />

        {params.q && (
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Search className="w-4 h-4 text-slate-400" />
            <span>Results for <span className="font-semibold text-slate-900">&quot;{params.q}&quot;</span></span>
            <Link href="/finance/quotations" className="text-blue-500 hover:text-blue-700 text-xs underline">Clear</Link>
          </div>
        )}

        {!quotations.length ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No quotations found</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Quotation</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 hidden md:table-cell">Customer</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 hidden lg:table-cell">Date</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 hidden lg:table-cell">Valid Until</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Amount</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {quotations.map((q) => (
                  <tr key={q.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-5 py-3.5"><p className="text-sm font-mono font-semibold text-slate-900">{q.quotation_number}</p></td>
                    <td className="px-4 py-3.5 hidden md:table-cell"><p className="text-sm text-slate-700">{q.customers?.full_name}</p><p className="text-xs text-slate-400">{q.customers?.mobile_number}</p></td>
                    <td className="px-4 py-3.5 hidden lg:table-cell text-sm text-slate-600">{formatDate(q.quotation_date)}</td>
                    <td className="px-4 py-3.5 hidden lg:table-cell text-sm text-slate-600">{q.valid_until ? formatDate(q.valid_until) : '—'}</td>
                    <td className="px-4 py-3.5 text-right text-sm font-bold text-slate-900">{formatCurrency(q.total_amount)}</td>
                    <td className="px-4 py-3.5"><span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${getStatusColor(q.status)}`}>{statusIcons[q.status]}{formatStatus(q.status)}</span></td>
                    <td className="px-4 py-3.5 text-right"><Link href={`/finance/quotations/${q.id}`} className="text-xs text-blue-600 hover:text-blue-700 font-medium px-2 py-1">View</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
