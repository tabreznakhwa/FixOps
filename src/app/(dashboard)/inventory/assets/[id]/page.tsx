import { createAdminClient, createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { BackButton } from '@/components/ui/BackButton'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils'
import { kuwaitISODate } from '@/lib/attendance'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { Pencil, Receipt } from 'lucide-react'
import {
  ASSET_CATEGORY_LABELS,
  ASSET_CONDITION_LABELS,
  ASSET_STATUS_LABELS,
  ASSET_PAYMENT_METHOD_LABELS,
  DISPOSAL_METHOD_LABELS,
  canViewAssets,
  canEditAssets,
  computeDepreciation,
  disposalGainLoss,
  type AssetStatus,
  type AssetCondition,
} from '@/lib/assets'

export const metadata = { title: 'Asset' }

type Event = {
  id: string
  event_type: string
  changes: Record<string, { before: unknown; after: unknown }> | null
  created_by: string | null
  created_at: string
}

const EVENT_LABELS: Record<string, string> = {
  created: 'Created',
  updated: 'Updated',
  assigned: 'Assigned',
  unassigned: 'Unassigned',
  status_changed: 'Status Changed',
  disposed: 'Disposed',
}

function statusBadge(status: AssetStatus) {
  const map: Record<AssetStatus, string> = {
    available: 'bg-green-100 text-green-700',
    assigned: 'bg-blue-100 text-blue-700',
    maintenance: 'bg-amber-100 text-amber-700',
    disposed: 'bg-slate-200 text-slate-600',
  }
  return map[status] ?? 'bg-slate-100 text-slate-700'
}

export default async function AssetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profileRaw } = await (supabase as any)
    .from('users')
    .select('organization_id, role, status')
    .eq('id', user.id)
    .single()

  const profile = profileRaw as { organization_id: string; role: string; status: string } | null
  if (!profile || profile.status !== 'active' || !profile.organization_id) redirect('/login')
  if (!canViewAssets(profile.role)) redirect('/dashboard?error=unauthorized')

  const { id } = await params

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any

  const { data: assetRaw } = await admin
    .from('assets')
    .select('*')
    .eq('id', id)
    .eq('organization_id', profile.organization_id)
    .maybeSingle()

  if (!assetRaw) notFound()

  const asset = assetRaw as {
    id: string
    asset_code: string
    asset_name: string
    category: string
    serial_number: string | null
    purchase_date: string | null
    purchase_cost: number
    payment_method: string
    purchase_reference: string | null
    supplier_id: string | null
    assigned_staff_id: string | null
    location: string | null
    condition: AssetCondition
    status: AssetStatus
    warranty_expiry: string | null
    service_due_date: string | null
    depreciation_start_date: string | null
    useful_life_months: number | null
    salvage_value: number
    disposal_date: string | null
    disposal_method: string | null
    disposal_proceeds: number | null
    disposal_payment_method: string | null
    disposal_reference: string | null
    disposal_reason: string | null
    notes: string | null
    created_at: string
    updated_at: string
  }

  const [{ data: expenseRaw }, { data: supplierRaw }, { data: staffRaw }, { data: eventsRaw }] = await Promise.all([
    admin.from('expenses').select('id, expense_number, amount, payment_method').eq('asset_id', asset.id).maybeSingle(),
    asset.supplier_id ? admin.from('suppliers').select('supplier_name').eq('id', asset.supplier_id).eq('organization_id', profile.organization_id).maybeSingle() : Promise.resolve({ data: null }),
    asset.assigned_staff_id ? admin.from('staff').select('full_name, staff_code').eq('id', asset.assigned_staff_id).eq('organization_id', profile.organization_id).maybeSingle() : Promise.resolve({ data: null }),
    admin.from('asset_events').select('id, event_type, changes, created_by, created_at').eq('asset_id', asset.id).order('created_at', { ascending: false }).limit(50),
  ])

  const today = kuwaitISODate()
  const valuationDate = asset.status === 'disposed' ? (asset.disposal_date ?? today) : today
  const depreciation = computeDepreciation({
    purchase_cost: Number(asset.purchase_cost),
    salvage_value: Number(asset.salvage_value ?? 0),
    useful_life_months: asset.useful_life_months,
    depreciation_start_date: asset.depreciation_start_date,
    valuation_date: valuationDate,
  })
  const gainLoss = asset.status === 'disposed'
    ? disposalGainLoss(asset.disposal_proceeds, depreciation.available ? depreciation.bookValue : 0)
    : null

  const events = (eventsRaw ?? []) as Event[]

  const field = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-sm font-medium text-slate-900 mt-0.5">{value}</p>
    </div>
  )

  return (
    <div className="animate-fade-in">
      <Header
        title={asset.asset_name}
        subtitle={asset.asset_code}
        actions={
          <div className="flex items-center gap-2">
            {canEditAssets(profile.role) && (
              <Link
                href={`/inventory/assets/${asset.id}/edit`}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Pencil className="w-4 h-4" /> Edit
              </Link>
            )}
            <BackButton fallbackHref="/inventory/assets" label="Back" />
          </div>
        }
      />

      <div className="p-6 space-y-5">
        <div className="flex items-center gap-3">
          <span className={`text-xs font-semibold px-3 py-1 rounded-full ${statusBadge(asset.status)}`}>
            {ASSET_STATUS_LABELS[asset.status]}
          </span>
          <span className="text-xs font-medium bg-slate-100 text-slate-700 px-3 py-1 rounded-full">
            {ASSET_CONDITION_LABELS[asset.condition]}
          </span>
          <span className="text-xs font-medium bg-slate-100 text-slate-700 px-3 py-1 rounded-full">
            {ASSET_CATEGORY_LABELS[asset.category as keyof typeof ASSET_CATEGORY_LABELS] ?? asset.category}
          </span>
        </div>

        <div className="grid md:grid-cols-2 gap-5">
          {/* Left column */}
          <div className="space-y-5">
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide mb-4">Acquisition</h2>
              <div className="grid grid-cols-2 gap-4">
                {field({ label: 'Purchase Date', value: formatDate(asset.purchase_date) })}
                {field({ label: 'Purchase Cost', value: formatCurrency(Number(asset.purchase_cost)) })}
                {field({ label: 'Payment Method', value: ASSET_PAYMENT_METHOD_LABELS[asset.payment_method as keyof typeof ASSET_PAYMENT_METHOD_LABELS] ?? asset.payment_method })}
                {field({ label: 'Supplier', value: supplierRaw?.supplier_name ?? '—' })}
                {field({ label: 'Reference', value: asset.purchase_reference ?? '—' })}
                {field({ label: 'Serial Number', value: asset.serial_number ?? '—' })}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide mb-4">Assignment & Warranty</h2>
              <div className="grid grid-cols-2 gap-4">
                {field({ label: 'Custodian', value: staffRaw?.full_name ?? '—' })}
                {field({ label: 'Location', value: asset.location ?? '—' })}
                {field({ label: 'Warranty Expiry', value: formatDate(asset.warranty_expiry) })}
                {field({ label: 'Service Due', value: formatDate(asset.service_due_date) })}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide mb-4">Linked Expense</h2>
              {expenseRaw ? (
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-slate-100 rounded-lg flex items-center justify-center">
                    <Receipt className="w-4 h-4 text-slate-500" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800 font-mono">{expenseRaw.expense_number}</p>
                    <p className="text-xs text-slate-500">{formatCurrency(Number(expenseRaw.amount))} capital purchase</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-amber-600">No linked purchase expense — this is a legacy or unreconciled asset.</p>
              )}
            </div>
          </div>

          {/* Right column */}
          <div className="space-y-5">
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide mb-4">Depreciation</h2>
              {depreciation.available ? (
                <div className="grid grid-cols-2 gap-4">
                  {field({ label: 'Useful Life', value: `${asset.useful_life_months} months` })}
                  {field({ label: 'Salvage Value', value: formatCurrency(depreciation.salvage) })}
                  {field({ label: 'Monthly Depreciation', value: formatCurrency(depreciation.monthlyDepreciation) })}
                  {field({ label: 'Months Depreciated', value: depreciation.completedMonths })}
                  {field({ label: 'Accumulated Depreciation', value: formatCurrency(depreciation.accumulatedDepreciation) })}
                  {field({ label: 'Current Book Value', value: <span className="text-blue-700 font-semibold">{formatCurrency(depreciation.bookValue)}</span> })}
                </div>
              ) : (
                <p className="text-sm text-slate-500">{depreciation.reason}</p>
              )}
            </div>

            {asset.status === 'disposed' && (
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide mb-4">Disposal</h2>
                <div className="grid grid-cols-2 gap-4">
                  {field({ label: 'Disposal Date', value: formatDate(asset.disposal_date) })}
                  {field({ label: 'Method', value: DISPOSAL_METHOD_LABELS[asset.disposal_method as keyof typeof DISPOSAL_METHOD_LABELS] ?? asset.disposal_method ?? '—' })}
                  {field({ label: 'Proceeds', value: formatCurrency(Number(asset.disposal_proceeds ?? 0)) })}
                  {field({ label: 'Receipt Method', value: asset.disposal_payment_method
                    ? ASSET_PAYMENT_METHOD_LABELS[asset.disposal_payment_method as keyof typeof ASSET_PAYMENT_METHOD_LABELS] ?? asset.disposal_payment_method
                    : '—' })}
                  {field({ label: 'Receipt Reference', value: asset.disposal_reference ?? '—' })}
                  {field({ label: 'Gain / (Loss)', value: <span className={gainLoss != null && gainLoss < 0 ? 'text-red-600 font-semibold' : 'text-green-600 font-semibold'}>{gainLoss == null ? '—' : formatCurrency(gainLoss)}</span> })}
                </div>
                {asset.disposal_reason && (
                  <div className="mt-4">
                    {field({ label: 'Reason', value: asset.disposal_reason })}
                  </div>
                )}
              </div>
            )}

            {asset.notes && (
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide mb-2">Notes</h2>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{asset.notes}</p>
              </div>
            )}
          </div>
        </div>

        {/* History */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide mb-4">History</h2>
          {events.length === 0 ? (
            <p className="text-sm text-slate-400">No history recorded.</p>
          ) : (
            <ul className="space-y-3">
              {events.map((event) => {
                const changedFields = event.changes ? Object.keys(event.changes) : []
                return (
                  <li key={event.id} className="flex gap-3">
                    <div className="mt-1 w-2 h-2 rounded-full bg-blue-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800">
                        {EVENT_LABELS[event.event_type] ?? event.event_type}
                        {changedFields.length > 0 && (
                          <span className="ml-2 text-xs text-slate-400 font-normal">({changedFields.join(', ')})</span>
                        )}
                      </p>
                      <p className="text-xs text-slate-400">{formatDateTime(event.created_at)}</p>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
