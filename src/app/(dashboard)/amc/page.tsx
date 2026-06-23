import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import { Plus, ShieldCheck, Clock, AlertTriangle } from 'lucide-react'
import { formatCurrency, formatDate, daysUntil, getStatusColor } from '@/lib/utils'

export const metadata = { title: 'AMC Contracts' }

export default async function AMCPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const params = await searchParams
  const supabase = await createClient()

  let query = supabase
    .from('amc_contracts')
    .select('id, contract_number, contract_type, start_date, end_date, contract_amount, billing_frequency, visits_included, visits_used, status, renewal_reminder_date, customers(full_name, mobile_number, company_name)')
    .order('end_date', { ascending: true })

  if (params.status) query = query.eq('status', params.status)

  const { data: contractsRaw } = await query.limit(50)
  const contracts = contractsRaw as unknown as Array<{
    id: string; contract_number: string; contract_type: string | null; start_date: string; end_date: string;
    contract_amount: number; billing_frequency: string; visits_included: number; visits_used: number;
    status: string; renewal_reminder_date: string | null;
    customers: { full_name: string; mobile_number: string; company_name?: string | null } | null
  }>

  // Stats
  const { data: allContractsRaw } = await supabase
    .from('amc_contracts')
    .select('status, contract_amount')
  const allContracts = allContractsRaw as unknown as { status: string; contract_amount: number }[]

  const activeContracts = allContracts?.filter((c) => c.status === 'active') ?? []
  const totalContractValue = activeContracts.reduce((s, c) => s + c.contract_amount, 0)
  const expiringCount = contracts?.filter((c) => {
    const days = daysUntil(c.end_date)
    return days !== null && days <= 30 && days >= 0
  }).length ?? 0

  return (
    <div className="animate-fade-in">
      <Header
        title="AMC Contracts"
        subtitle="Annual Maintenance Contract management"
        actions={
          <Link
            href="/amc/new"
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" /> New Contract
          </Link>
        }
      />

      <div className="p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Active Contracts', value: activeContracts.length, icon: ShieldCheck, color: 'text-green-600', bg: 'bg-green-50' },
            { label: 'Total Value', value: formatCurrency(totalContractValue), icon: ShieldCheck, color: 'text-blue-600', bg: 'bg-blue-50', isText: true },
            { label: 'Expiring in 30 days', value: expiringCount, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
            { label: 'Expired', value: allContracts?.filter((c) => c.status === 'expired').length ?? 0, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
          ].map(({ label, value, icon: Icon, color, bg, isText }) => (
            <div key={label} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className={`w-8 h-8 ${bg} rounded-lg flex items-center justify-center mb-3`}>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
              <p className={`font-bold text-slate-900 ${isText ? 'text-lg' : 'text-2xl'}`}>{value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Status Tabs */}
        <div className="flex gap-2">
          {[
            { label: 'All', value: '' },
            { label: 'Active', value: 'active' },
            { label: 'Expiring Soon', value: 'expiring' },
            { label: 'Expired', value: 'expired' },
            { label: 'Cancelled', value: 'cancelled' },
          ].map(({ label, value }) => (
            <Link
              key={label}
              href={value ? `/amc?status=${value}` : '/amc'}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                params.status === value || (!params.status && !value) ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {label}
            </Link>
          ))}
        </div>

        {/* Contracts Grid */}
        {!contracts?.length ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <ShieldCheck className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No AMC contracts found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {contracts.map((c) => {
              const customer = c.customers as { full_name: string; mobile_number: string; company_name?: string | null } | null
              const daysLeft = daysUntil(c.end_date)
              const visitProgress = c.visits_included > 0 ? (c.visits_used / c.visits_included) * 100 : 0
              const isExpiringSoon = daysLeft !== null && daysLeft <= 30 && daysLeft >= 0
              const isExpired = daysLeft !== null && daysLeft < 0

              return (
                <Link
                  key={c.id}
                  href={`/amc/${c.id}`}
                  className={`block bg-white rounded-xl border ${isExpiringSoon ? 'border-amber-300' : isExpired ? 'border-red-300' : 'border-slate-200'} p-5 hover:shadow-md transition-all`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="text-xs font-mono text-slate-400">{c.contract_number}</p>
                      <p className="text-sm font-bold text-slate-900 mt-0.5">
                        {customer?.company_name ?? customer?.full_name}
                      </p>
                      {customer?.company_name && (
                        <p className="text-xs text-slate-500">{customer.full_name}</p>
                      )}
                    </div>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${getStatusColor(c.status)}`}>
                      {c.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-4 text-xs">
                    <div>
                      <p className="text-slate-400">Contract Value</p>
                      <p className="font-bold text-slate-900 text-sm">{formatCurrency(c.contract_amount)}</p>
                    </div>
                    <div>
                      <p className="text-slate-400">Frequency</p>
                      <p className="font-semibold text-slate-700 capitalize">{c.billing_frequency}</p>
                    </div>
                    <div>
                      <p className="text-slate-400">Start Date</p>
                      <p className="font-semibold text-slate-700">{formatDate(c.start_date)}</p>
                    </div>
                    <div>
                      <p className="text-slate-400">End Date</p>
                      <p className={`font-semibold ${isExpiringSoon ? 'text-amber-600' : isExpired ? 'text-red-600' : 'text-slate-700'}`}>
                        {formatDate(c.end_date)}
                      </p>
                    </div>
                  </div>

                  {/* Visits progress */}
                  {c.visits_included > 0 && (
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="text-slate-500">Visits Used</span>
                        <span className="font-semibold text-slate-700">{c.visits_used} / {c.visits_included}</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${visitProgress >= 90 ? 'bg-red-500' : visitProgress >= 70 ? 'bg-amber-500' : 'bg-blue-500'}`}
                          style={{ width: `${Math.min(visitProgress, 100)}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Days left badge */}
                  {daysLeft !== null && (
                    <div className={`mt-3 flex items-center gap-1.5 text-xs font-medium ${isExpired ? 'text-red-600' : isExpiringSoon ? 'text-amber-600' : 'text-green-600'}`}>
                      {isExpired ? <AlertTriangle className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                      {isExpired ? `Expired ${Math.abs(daysLeft)} days ago` : `${daysLeft} days remaining`}
                    </div>
                  )}
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
