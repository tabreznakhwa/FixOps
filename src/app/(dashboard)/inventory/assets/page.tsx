import { createAdminClient, createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { RefreshButton } from '@/components/ui/RefreshButton'
import { SearchBar } from '@/components/ui/SearchBar'
import { CategorySelect } from '@/components/ui/CategorySelect'
import { formatCurrency, formatDate } from '@/lib/utils'
import { kuwaitISODate } from '@/lib/attendance'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Plus, Package } from 'lucide-react'
import { Suspense } from 'react'
import {
  ASSET_CATEGORIES,
  ASSET_CATEGORY_LABELS,
  ASSET_STATUS_LABELS,
  ASSET_CONDITION_LABELS,
  ASSET_STATUSES,
  ASSET_CONDITIONS,
  canViewAssets,
  canEditAssets,
  computeDepreciation,
  type AssetStatus,
  type AssetCondition,
} from '@/lib/assets'

export const metadata = { title: 'Company Assets' }

const PAGE_SIZE = 50

type AssetRow = {
  id: string
  asset_code: string
  asset_name: string
  category: string
  serial_number: string | null
  purchase_date: string | null
  purchase_cost: number
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
}

export default async function AssetsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; status?: string; condition?: string; page?: string }>
}) {
  const params = await searchParams
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any

  const q = (params.q ?? '').trim()
  const safeQ = q.replace(/[',"]/g, '')
  const category = params.category ?? ''
  const status = params.status ?? ''
  const condition = params.condition ?? ''

  // The generic query builder is reused for summary and paginated projections.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buildQuery = (base: any) => {
    let query = base.from('assets').eq('organization_id', profile.organization_id)
    if (safeQ) {
      query = query.or(
        `asset_code.ilike.%${safeQ}%,asset_name.ilike.%${safeQ}%,serial_number.ilike.%${safeQ}%,location.ilike.%${safeQ}%`,
      )
    }
    if (category) query = query.eq('category', category)
    if (status) query = query.eq('status', status)
    if (condition) query = query.eq('condition', condition)
    return query
  }

  const today = kuwaitISODate()

  // Summary across the whole filtered set (exact, independent of pagination).
  type SummaryRow = {
    purchase_cost: number
    status: string
    warranty_expiry: string | null
    service_due_date: string | null
  }
  const summary: SummaryRow[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data: batch, error } = await buildQuery(admin)
      .select('purchase_cost, status, warranty_expiry, service_due_date')
      .order('id')
      .range(offset, offset + 999)
    if (error) throw error
    const rows = (batch ?? []) as SummaryRow[]
    summary.push(...rows)
    if (rows.length < 1000) break
  }
  const activeCount = summary.filter((a) => a.status !== 'disposed').length
  const totalCost = summary.reduce((s, a) => s + Number(a.purchase_cost ?? 0), 0)
  const dueWindowDate = new Date(`${today}T00:00:00Z`)
  dueWindowDate.setUTCDate(dueWindowDate.getUTCDate() + 30)
  const dueWindowISO = dueWindowDate.toISOString().slice(0, 10)
  const dueWarranty = summary.filter((a) => a.warranty_expiry && a.warranty_expiry >= today && a.warranty_expiry <= dueWindowISO).length
  const dueService = summary.filter((a) => a.service_due_date && a.service_due_date >= today && a.service_due_date <= dueWindowISO).length

  // Paginated list.
  const rawPage = Number(params.page ?? '1')
  const page = Number.isInteger(rawPage) && rawPage > 0 ? Math.min(rawPage, 100_000) : 1
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  const { data: rowsRaw, count } = await buildQuery(admin)
    .select(
      'id, asset_code, asset_name, category, serial_number, purchase_date, purchase_cost, assigned_staff_id, location, condition, status, warranty_expiry, service_due_date, depreciation_start_date, useful_life_months, salvage_value, disposal_date',
      { count: 'exact' },
    )
    .order('asset_code')
    .range(from, to)

  const assets = (rowsRaw ?? []) as AssetRow[]
  const totalCount = count ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const currentPage = page

  const withBookValue = assets.map((a) => {
    const valuationDate = a.status === 'disposed' ? a.disposal_date ?? today : today
    const dep = computeDepreciation({
      purchase_cost: Number(a.purchase_cost),
      salvage_value: Number(a.salvage_value ?? 0),
      useful_life_months: a.useful_life_months,
      depreciation_start_date: a.depreciation_start_date,
      valuation_date: valuationDate,
    })
    return { asset: a, bookValue: dep.available ? dep.bookValue : null }
  })

  const pageUrl = (p: number) => {
    const search = new URLSearchParams()
    if (safeQ) search.set('q', q)
    if (category) search.set('category', category)
    if (status) search.set('status', status)
    if (condition) search.set('condition', condition)
    if (p > 1) search.set('page', String(p))
    const s = search.toString()
    return `/inventory/assets${s ? `?${s}` : ''}`
  }

  return (
    <div className="animate-fade-in">
      <Header
        title="Company Assets"
        subtitle="Fixed-asset register with straight-line depreciation"
        actions={
          <div className="flex items-center gap-2">
            <RefreshButton />
            {canEditAssets(profile.role) && (
              <Link
                href="/inventory/assets/new"
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4" /> Record Asset
              </Link>
            )}
          </div>
        }
      />

      <div className="p-6 space-y-5">
        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Active Assets', value: activeCount, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: 'Acquisition Cost', value: formatCurrency(totalCost), color: 'text-slate-800', bg: 'bg-slate-50', isText: true },
            { label: 'Warranty Due (30d)', value: dueWarranty, color: 'text-amber-600', bg: 'bg-amber-50' },
            { label: 'Service Due (30d)', value: dueService, color: 'text-purple-600', bg: 'bg-purple-50' },
          ].map(({ label, value, color, isText }) => (
            <div key={label} className={`bg-white rounded-xl border border-slate-200 p-4`}>
              <p className={`font-bold text-slate-900 ${isText ? 'text-lg' : 'text-2xl'} ${color}`}>{value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <Suspense>
            <SearchBar basePath="/inventory/assets" placeholder="Search code, name, serial, location…" />
          </Suspense>
          <Suspense>
            <CategorySelect basePath="/inventory/assets" categories={[...ASSET_CATEGORIES]} labelMap={ASSET_CATEGORY_LABELS} value={category} allLabel="All Categories" />
          </Suspense>
          <Suspense>
            <CategorySelect basePath="/inventory/assets" categories={[...ASSET_STATUSES]} labelMap={ASSET_STATUS_LABELS} value={status} paramKey="status" allLabel="All Statuses" />
          </Suspense>
          <Suspense>
            <CategorySelect basePath="/inventory/assets" categories={[...ASSET_CONDITIONS]} labelMap={ASSET_CONDITION_LABELS} value={condition} paramKey="condition" allLabel="All Conditions" />
          </Suspense>
        </div>

        {/* Table */}
        {assets.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <Package className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No assets recorded</p>
            <p className="text-slate-400 text-sm mt-1">Record a fixed asset and its linked purchase expense</p>
            {canEditAssets(profile.role) && (
              <Link
                href="/inventory/assets/new"
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4" /> Record Asset
              </Link>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Asset</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 hidden md:table-cell">Category</th>
                    <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Cost</th>
                    <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Book Value</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 hidden lg:table-cell">Custodian / Location</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {withBookValue.map(({ asset, bookValue }) => (
                    <tr key={asset.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="px-5 py-3.5">
                        <Link href={`/inventory/assets/${asset.id}`} className="block">
                          <p className="text-sm font-semibold text-slate-800 group-hover:text-blue-700 transition-colors">{asset.asset_name}</p>
                          <p className="text-xs text-slate-400 font-mono">{asset.asset_code}</p>
                          {asset.serial_number && <p className="text-xs text-slate-500">S/N {asset.serial_number}</p>}
                        </Link>
                      </td>
                      <td className="px-4 py-3.5 hidden md:table-cell">
                        <span className="text-xs font-medium bg-slate-100 text-slate-700 px-2 py-1 rounded-lg">
                          {ASSET_CATEGORY_LABELS[asset.category as keyof typeof ASSET_CATEGORY_LABELS] ?? asset.category}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right text-sm text-slate-600 whitespace-nowrap">
                        <p>{formatCurrency(Number(asset.purchase_cost))}</p>
                        <p className="text-xs text-slate-400">{formatDate(asset.purchase_date)}</p>
                      </td>
                      <td className="px-4 py-3.5 text-right text-sm font-semibold text-slate-900">
                        {bookValue == null ? '—' : formatCurrency(bookValue)}
                      </td>
                      <td className="px-4 py-3.5 hidden lg:table-cell text-sm text-slate-600">
                        <p>{asset.location ?? '—'}</p>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                          asset.status === 'disposed' ? 'bg-slate-200 text-slate-600'
                          : asset.status === 'assigned' ? 'bg-blue-100 text-blue-700'
                          : asset.status === 'maintenance' ? 'bg-amber-100 text-amber-700'
                          : 'bg-green-100 text-green-700'
                        }`}>
                          {ASSET_STATUS_LABELS[asset.status]}
                        </span>
                        {asset.status !== 'disposed' && asset.warranty_expiry && asset.warranty_expiry < today && (
                          <p className="text-xs text-red-500 mt-1">Warranty expired</p>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <Link
                          href={`/inventory/assets/${asset.id}`}
                          className="text-xs text-blue-600 hover:text-blue-700 font-medium opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          View →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100">
                <p className="text-xs text-slate-500">
                  {totalCount} assets · page {currentPage} of {totalPages}
                </p>
                <div className="flex items-center gap-2">
                  {currentPage > 1 && (
                    <Link href={pageUrl(currentPage - 1)} className="text-sm font-semibold text-blue-600 hover:text-blue-700">
                      ← Previous
                    </Link>
                  )}
                  {currentPage < totalPages && (
                    <Link href={pageUrl(currentPage + 1)} className="text-sm font-semibold text-blue-600 hover:text-blue-700">
                      Next →
                    </Link>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
