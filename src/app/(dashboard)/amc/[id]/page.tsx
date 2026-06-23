import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ShieldCheck, CheckCircle, Package } from 'lucide-react'
import { formatCurrency, formatDate, getStatusColor, formatStatus } from '@/lib/utils'
import { AMCActions } from './AMCActions'

export const metadata = { title: 'AMC Contract' }

export default async function AMCDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: contractRaw } = await supabase
    .from('amc_contracts')
    .select(
      'id, contract_number, contract_type, start_date, end_date, contract_amount, billing_frequency, services_included, visits_included, visits_used, parts_included, payment_terms, status, renewal_reminder_date, notes, customers(id, full_name, company_name, mobile_number, email)',
    )
    .eq('id', id)
    .single()

  if (!contractRaw) notFound()

  const contract = contractRaw as unknown as {
    id: string
    contract_number: string
    contract_type: string | null
    start_date: string
    end_date: string
    contract_amount: number
    billing_frequency: string
    services_included: string[]
    visits_included: number
    visits_used: number
    parts_included: boolean
    payment_terms: number
    status: string
    renewal_reminder_date: string | null
    notes: string | null
    customers: {
      id: string
      full_name: string
      company_name: string | null
      mobile_number: string
      email: string | null
    } | null
  }

  const customer = contract.customers
  const visitProgress =
    contract.visits_included > 0
      ? Math.min((contract.visits_used / contract.visits_included) * 100, 100)
      : 0

  return (
    <div className="animate-fade-in">
      <Header
        title={contract.contract_number}
        subtitle="AMC Contract Details"
        actions={
          <Link
            href="/amc"
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </Link>
        }
      />

      <div className="p-6">
        {/* Header card */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-5 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-lg font-bold text-slate-900">{contract.contract_number}</p>
              <p className="text-sm text-slate-500 capitalize">{contract.contract_type?.replace(/_/g, ' ') ?? '—'}</p>
            </div>
          </div>
          <span className={`text-sm font-semibold px-3 py-1.5 rounded-full ${getStatusColor(contract.status)}`}>
            {formatStatus(contract.status)}
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Left / main column */}
          <div className="lg:col-span-2 space-y-5">
            {/* Customer */}
            {customer && (
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Customer</h3>
                <p className="text-sm font-bold text-slate-900">
                  {customer.company_name ?? customer.full_name}
                </p>
                {customer.company_name && (
                  <p className="text-sm text-slate-500">{customer.full_name}</p>
                )}
                <div className="mt-2 space-y-1">
                  <p className="text-sm text-slate-600">{customer.mobile_number}</p>
                  {customer.email && <p className="text-sm text-slate-600">{customer.email}</p>}
                </div>
                <Link
                  href={`/customers/${customer.id}`}
                  className="mt-3 inline-block text-xs text-blue-600 hover:text-blue-700 font-medium"
                >
                  View customer →
                </Link>
              </div>
            )}

            {/* Contract details */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Contract Details</h3>
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <div>
                  <p className="text-xs text-slate-400 mb-0.5">Contract Type</p>
                  <p className="text-sm font-semibold text-slate-900 capitalize">
                    {contract.contract_type?.replace(/_/g, ' ') ?? '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 mb-0.5">Contract Value</p>
                  <p className="text-sm font-bold text-slate-900">{formatCurrency(contract.contract_amount)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 mb-0.5">Start Date</p>
                  <p className="text-sm font-semibold text-slate-900">{formatDate(contract.start_date)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 mb-0.5">End Date</p>
                  <p className="text-sm font-semibold text-slate-900">{formatDate(contract.end_date)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 mb-0.5">Billing Frequency</p>
                  <p className="text-sm font-semibold text-slate-900 capitalize">{contract.billing_frequency.replace(/_/g, ' ')}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 mb-0.5">Payment Terms</p>
                  <p className="text-sm font-semibold text-slate-900">
                    {contract.payment_terms === 0 ? 'Due on Receipt' : `Net ${contract.payment_terms}`}
                  </p>
                </div>
                {contract.renewal_reminder_date && (
                  <div>
                    <p className="text-xs text-slate-400 mb-0.5">Renewal Reminder</p>
                    <p className="text-sm font-semibold text-slate-900">{formatDate(contract.renewal_reminder_date)}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Services */}
            {contract.services_included?.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Services Included</h3>
                <div className="flex flex-wrap gap-2">
                  {contract.services_included.map((s) => (
                    <span key={s} className="flex items-center gap-1.5 text-xs font-medium bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg">
                      <CheckCircle className="w-3 h-3" /> {s}
                    </span>
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <Package className={`w-4 h-4 ${contract.parts_included ? 'text-green-600' : 'text-slate-400'}`} />
                  <span className={`text-sm font-medium ${contract.parts_included ? 'text-green-700' : 'text-slate-500'}`}>
                    Parts {contract.parts_included ? 'Included' : 'Not Included'}
                  </span>
                </div>
              </div>
            )}

            {/* Visits progress */}
            {contract.visits_included > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Visits Progress</h3>
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-slate-600">Used</span>
                  <span className="font-bold text-slate-900">
                    {contract.visits_used} / {contract.visits_included}
                  </span>
                </div>
                <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      visitProgress >= 90 ? 'bg-red-500' : visitProgress >= 70 ? 'bg-amber-500' : 'bg-blue-500'
                    }`}
                    style={{ width: `${visitProgress}%` }}
                  />
                </div>
                <p className="text-xs text-slate-400 mt-1.5">{contract.visits_included - contract.visits_used} visits remaining</p>
              </div>
            )}

            {/* Notes */}
            {contract.notes && (
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Notes</h3>
                <p className="text-sm text-slate-700 whitespace-pre-line">{contract.notes}</p>
              </div>
            )}
          </div>

          {/* Right column — actions */}
          <div>
            <AMCActions
              contractId={contract.id}
              currentStatus={contract.status}
              visitsUsed={contract.visits_used}
              visitsIncluded={contract.visits_included}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
