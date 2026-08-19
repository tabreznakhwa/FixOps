import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { BackButton } from '@/components/ui/BackButton'
import { PrintActions } from '@/components/print/PrintActions'
import { OrgLetterhead } from '@/components/print/OrgLetterhead'
import { DateRangeFilter } from '@/components/ui/DateRangeFilter'
import { SearchBar } from '@/components/ui/SearchBar'
import { formatCurrency, formatDate } from '@/lib/utils'
import { AlertTriangle, Package } from 'lucide-react'
import Link from 'next/link'
import { Suspense } from 'react'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Parts Used' }

/**
 * What parts actually went out on jobs, over a date range.
 *
 * Built from work_order_line_items rather than inventory_transactions on
 * purpose. Issuing a part historically decremented inventory_items.current_stock
 * without writing a ledger row, so the transactions table under-reports
 * consumption for anything before that was fixed. The line items are the record
 * of what was actually fitted, and they go back to the beginning.
 */
export default async function PartsUsedPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; view?: string; q?: string }>
}) {
  const params = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient() as any
  const { data: profileRaw } = await admin
    .from('users').select('organization_id, role').eq('id', user.id).single()
  const profile = profileRaw as { organization_id: string; role: string } | null

  // Shows cost prices — same roles the rest of inventory reporting uses.
  if (!profile || !['owner', 'admin', 'manager', 'store', 'accounts'].includes(profile.role)) {
    redirect('/dashboard?error=unauthorized')
  }

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuwait' })
  const from = params.from || '2026-07-01'
  const to = params.to || today
  const view = params.view === 'detail' || params.view === 'technician' ? params.view : 'summary'
  const q = (params.q ?? '').trim().toLowerCase()

  // Line items carry no organization_id filter on the join, so scope explicitly.
  const { data: rowsRaw } = await admin
    .from('work_order_line_items')
    .select(`
      id, description, quantity, unit_price, created_at, inventory_item_id,
      inventory_items(item_code, item_name, category, unit_of_measure, purchase_price),
      work_orders(work_order_number, complaint_id, customer_id, technician_name,
                  complaints(complaint_number), customers(full_name))
    `)
    .eq('organization_id', profile.organization_id)
    .eq('item_type', 'part')
    .not('inventory_item_id', 'is', null)
    .gte('created_at', `${from}T00:00:00`)
    .lte('created_at', `${to}T23:59:59`)
    .order('created_at', { ascending: false })
    .limit(5000)

  type Row = {
    id: string; description: string; quantity: number; unit_price: number
    created_at: string; inventory_item_id: string
    inventory_items: { item_code: string; item_name: string; category: string | null; unit_of_measure: string; purchase_price: number } | null
    work_orders: {
      work_order_number: string
      technician_name: string | null
      complaints: { complaint_number: string } | null
      customers: { full_name: string } | null
    } | null
  }

  const all = (rowsRaw ?? []) as Row[]
  const rows = q
    ? all.filter(r =>
        (r.inventory_items?.item_name ?? '').toLowerCase().includes(q) ||
        (r.inventory_items?.item_code ?? '').toLowerCase().includes(q) ||
        (r.description ?? '').toLowerCase().includes(q) ||
        (r.work_orders?.technician_name ?? '').toLowerCase().includes(q) ||
        (r.work_orders?.work_order_number ?? '').toLowerCase().includes(q) ||
        (r.work_orders?.complaints?.complaint_number ?? '').toLowerCase().includes(q) ||
        (r.work_orders?.customers?.full_name ?? '').toLowerCase().includes(q))
    : all

  // Summary per item
  const byItem = new Map<string, {
    code: string; name: string; category: string | null; uom: string
    qty: number; cost: number; charged: number; jobs: Set<string>
  }>()

  for (const r of rows) {
    const key = r.inventory_item_id
    const cur = byItem.get(key) ?? {
      code: r.inventory_items?.item_code ?? '—',
      name: r.inventory_items?.item_name ?? r.description,
      category: r.inventory_items?.category ?? null,
      uom: r.inventory_items?.unit_of_measure ?? 'pcs',
      qty: 0, cost: 0, charged: 0, jobs: new Set<string>(),
    }
    const qty = Number(r.quantity) || 0
    cur.qty += qty
    cur.cost += qty * (Number(r.inventory_items?.purchase_price) || 0)
    cur.charged += qty * (Number(r.unit_price) || 0)
    if (r.work_orders?.work_order_number) cur.jobs.add(r.work_orders.work_order_number)
    byItem.set(key, cur)
  }

  const summary = [...byItem.values()].sort((a, b) => b.cost - a.cost)

  const byTechnician = new Map<string, {
    technician: string; qty: number; cost: number; charged: number; jobs: Set<string>; complaints: Set<string>; items: Set<string>
  }>()

  for (const r of rows) {
    const technician = r.work_orders?.technician_name?.trim() || 'Unassigned'
    const cur = byTechnician.get(technician) ?? {
      technician, qty: 0, cost: 0, charged: 0, jobs: new Set<string>(), complaints: new Set<string>(), items: new Set<string>(),
    }
    const qty = Number(r.quantity) || 0
    cur.qty += qty
    cur.cost += qty * (Number(r.inventory_items?.purchase_price) || 0)
    cur.charged += qty * (Number(r.unit_price) || 0)
    if (r.work_orders?.work_order_number) cur.jobs.add(r.work_orders.work_order_number)
    if (r.work_orders?.complaints?.complaint_number) cur.complaints.add(r.work_orders.complaints.complaint_number)
    cur.items.add(r.inventory_items?.item_name ?? r.description)
    byTechnician.set(technician, cur)
  }

  const technicianSummary = [...byTechnician.values()].sort((a, b) => b.cost - a.cost)
  const totalCost = summary.reduce((s, i) => s + i.cost, 0)
  const totalCharged = summary.reduce((s, i) => s + i.charged, 0)
  const totalQty = summary.reduce((s, i) => s + i.qty, 0)

  const viewHref = (v: string) => {
    const qs = new URLSearchParams()
    qs.set('from', from); qs.set('to', to)
    if (q) qs.set('q', q)
    if (v !== 'summary') qs.set('view', v)
    return `/inventory/parts-used?${qs.toString()}`
  }

  const viewLabel = view === 'technician' ? 'By Technician' : view === 'detail' ? 'By Job' : 'By Item'

  return (
    <div className="animate-fade-in">
      <div className="hidden print:block px-8 pt-8">
        <OrgLetterhead title="Parts Used" subtitle={`${viewLabel} · ${formatDate(from)} to ${formatDate(to)}`} />
      </div>

      <Header
        title="Parts Used"
        subtitle="Parts issued to jobs, by item and by job"
        actions={
          <div className="flex items-center gap-2">
            <PrintActions label="Print" />
            <BackButton fallbackHref="/inventory" label="Inventory" />
          </div>
        }
      />

      <div className="p-6 space-y-5">
        <div className="flex flex-wrap items-center gap-3 bg-white border border-slate-200 rounded-xl p-3 print:hidden">
          <Suspense>
            <DateRangeFilter basePath="/inventory/parts-used" from={params.from} to={params.to} />
          </Suspense>
          <Suspense>
            <SearchBar basePath="/inventory/parts-used" placeholder="Item, technician, complaint…" />
          </Suspense>
        </div>

        <div className="flex gap-2 print:hidden">
          {[{ v: 'summary', l: 'By Item' }, { v: 'detail', l: 'By Job' }, { v: 'technician', l: 'By Technician' }].map(({ v, l }) => (
            <Link key={v} href={viewHref(v)}
              className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                view === v ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
              {l}
            </Link>
          ))}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Distinct Items</p>
            <p className="text-lg font-bold text-slate-900">{summary.length}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Units Issued</p>
            <p className="text-lg font-bold text-slate-900">{totalQty.toFixed(2)}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Cost of Parts</p>
            <p className="text-lg font-bold text-amber-700">{formatCurrency(totalCost)}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Charged to Customer</p>
            <p className="text-lg font-bold text-green-700">{formatCurrency(totalCharged)}</p>
          </div>
        </div>

        {totalCharged === 0 && totalQty > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-amber-900">
              Parts were issued but nothing was charged for them — every line has a
              zero unit price. Check the selling prices on those items, otherwise the
              cost is being absorbed on every job.
            </p>
          </div>
        )}

        {rows.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <Package className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No parts issued between {formatDate(from)} and {formatDate(to)}</p>
          </div>
        ) : view === 'technician' ? (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900">By Technician</h3>
              <p className="text-xs text-slate-500 mt-0.5">Who used which parts, on which jobs and complaints</p>
            </div>
            <div className="overflow-x-auto print-report">
              <table className="w-full min-w-[900px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Technician</th>
                    <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Qty Used</th>
                    <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Items</th>
                    <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Jobs</th>
                    <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Complaints</th>
                    <th className="text-right text-xs font-semibold text-amber-700 uppercase tracking-wider px-4 py-3">Cost</th>
                    <th className="text-right text-xs font-semibold text-green-700 uppercase tracking-wider px-5 py-3">Charged</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {technicianSummary.map(t => (
                    <tr key={t.technician} className="hover:bg-slate-50/50">
                      <td className="px-5 py-3 text-sm font-medium text-slate-800">{t.technician}</td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-slate-900">{t.qty.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right text-sm text-slate-600">{t.items.size}</td>
                      <td className="px-4 py-3 text-right text-sm text-slate-600">{t.jobs.size}</td>
                      <td className="px-4 py-3 text-right text-sm text-slate-600">{t.complaints.size}</td>
                      <td className="px-4 py-3 text-right text-sm text-amber-700">{formatCurrency(t.cost)}</td>
                      <td className="px-5 py-3 text-right text-sm text-green-700">
                        {t.charged > 0 ? formatCurrency(t.charged) : <span className="text-slate-300">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 border-t border-slate-200">
                    <td className="px-5 py-3 text-sm font-bold text-slate-900">Total</td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-slate-900">{totalQty.toFixed(2)}</td>
                    <td className="px-4 py-3" colSpan={3} />
                    <td className="px-4 py-3 text-right text-sm font-bold text-amber-700">{formatCurrency(totalCost)}</td>
                    <td className="px-5 py-3 text-right text-sm font-bold text-green-700">{formatCurrency(totalCharged)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        ) : view === 'summary' ? (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900">By Item</h3>
              <p className="text-xs text-slate-500 mt-0.5">Highest cost first</p>
            </div>
            <div className="overflow-x-auto print-report">
              <table className="w-full min-w-[760px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Item</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Category</th>
                    <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Qty Used</th>
                    <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Jobs</th>
                    <th className="text-right text-xs font-semibold text-amber-700 uppercase tracking-wider px-4 py-3">Cost</th>
                    <th className="text-right text-xs font-semibold text-green-700 uppercase tracking-wider px-5 py-3">Charged</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {summary.map(i => (
                    <tr key={i.code} className="hover:bg-slate-50/50">
                      <td className="px-5 py-3">
                        <p className="text-sm font-medium text-slate-800">{i.name}</p>
                        <p className="text-xs font-mono text-slate-400">{i.code}</p>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">{i.category ?? '—'}</td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-slate-900">
                        {i.qty.toFixed(2)} <span className="text-xs text-slate-400">{i.uom}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-slate-600">{i.jobs.size}</td>
                      <td className="px-4 py-3 text-right text-sm text-amber-700">{formatCurrency(i.cost)}</td>
                      <td className="px-5 py-3 text-right text-sm text-green-700">
                        {i.charged > 0 ? formatCurrency(i.charged) : <span className="text-slate-300">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 border-t border-slate-200">
                    <td className="px-5 py-3 text-sm font-bold text-slate-900" colSpan={2}>Total</td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-slate-900">{totalQty.toFixed(2)}</td>
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3 text-right text-sm font-bold text-amber-700">{formatCurrency(totalCost)}</td>
                    <td className="px-5 py-3 text-right text-sm font-bold text-green-700">{formatCurrency(totalCharged)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900">By Job</h3>
              <p className="text-xs text-slate-500 mt-0.5">{rows.length} issues, most recent first</p>
            </div>
            <div className="overflow-x-auto print-report">
              <table className="w-full min-w-[1020px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Date</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Item</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Technician</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Work Order</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Complaint</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Customer</th>
                    <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Qty</th>
                    <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Charged</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {rows.map(r => (
                    <tr key={r.id} className="hover:bg-slate-50/50">
                      <td className="px-5 py-3 text-sm text-slate-600 whitespace-nowrap">{formatDate(r.created_at)}</td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-slate-800">{r.inventory_items?.item_name ?? r.description}</p>
                        <p className="text-xs font-mono text-slate-400">{r.inventory_items?.item_code ?? '—'}</p>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">{r.work_orders?.technician_name ?? '—'}</td>
                      <td className="px-4 py-3 text-sm font-mono text-slate-600">{r.work_orders?.work_order_number ?? '—'}</td>
                      <td className="px-4 py-3 text-sm font-mono text-slate-600">{r.work_orders?.complaints?.complaint_number ?? '—'}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{r.work_orders?.customers?.full_name ?? '—'}</td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-slate-900">{Number(r.quantity).toFixed(2)}</td>
                      <td className="px-5 py-3 text-right text-sm text-slate-700">
                        {Number(r.unit_price) > 0
                          ? formatCurrency(Number(r.quantity) * Number(r.unit_price))
                          : <span className="text-slate-300">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <p className="text-xs text-slate-400 print:hidden">
          Taken from work order line items — the record of what was actually fitted —
          rather than the stock ledger, which did not record issues before 11 Aug 2026.
        </p>
      </div>
    </div>
  )
}
