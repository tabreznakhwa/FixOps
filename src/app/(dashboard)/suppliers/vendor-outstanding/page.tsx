import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { getAuthedProfile } from '@/lib/auth/session'
import { getRoleAccess } from '@/lib/orgPermissions'
import { Header } from '@/components/layout/Header'
import { formatCurrency, formatDate } from '@/lib/utils'
import { AlertCircle, AlertTriangle } from 'lucide-react'
import Link from 'next/link'
import { DocumentLink } from '@/components/ui/DocumentLink'
import { OrgLetterhead } from '@/components/print/OrgLetterhead'
import { PrintActions } from '@/components/print/PrintActions'
import { SupplierFilter } from './SupplierFilter'
import { DateRangeFilter } from '@/components/ui/DateRangeFilter'
import { SearchBar } from '@/components/ui/SearchBar'
import { Suspense } from 'react'
import { buildVendorLedger } from './vendorLedger'
import { VendorLedgerTable } from './VendorLedgerTable'
import { buildVendorWiseOutstanding } from './vendorWiseOutstanding'
import { VendorWiseOutstandingTable } from './VendorWiseOutstandingTable'
import { buildBillWiseOutstanding } from './billWiseOutstanding'
import { readPagedRows } from './reportPaging'
import { AsOnFilter } from './AsOnFilter'
import { currentPath, withReturnTo } from '@/lib/backNav'

export const metadata = { title: 'Vendor Bill-wise Outstanding' }

type View = 'bills' | 'vendorwise' | 'ledger'

function daysBetweenIso(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000)
}

export default async function VendorOutstandingPage({
  searchParams,
}: {
  searchParams: Promise<{ supplier?: string; from?: string; to?: string; q?: string; view?: string; as_on?: string }>
}) {
  const params = await searchParams
  const outstandingPath = currentPath('/suppliers/vendor-outstanding', params)
  const view: View =
    params.view === 'ledger' ? 'ledger' : params.view === 'vendorwise' ? 'vendorwise' : 'bills'
  const { profile } = await getAuthedProfile()
  if (!profile || profile.status !== 'active' || !profile.organization_id) redirect('/login')
  const financeAccess = await getRoleAccess(profile.organization_id, profile.role)
  if (financeAccess.finance === 'none') redirect('/dashboard?error=unauthorized')
  const orgId = profile.organization_id

  // Finance tables and migration-055 posting metadata trail the hand-maintained type.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any

  type SupplierOption = { id: string; supplier_name: string; supplier_code: string }
  const supplierSourceWarning: string[] = []
  const allSuppliers = await readPagedRows<SupplierOption>(
    (from, to) => admin
      .from('suppliers')
      .select('id, supplier_name, supplier_code')
      .eq('organization_id', orgId)
      .order('supplier_name', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to),
    supplierSourceWarning,
    'suppliers',
  )

  const billWise = view === 'bills'
    ? await buildBillWiseOutstanding(admin, orgId, {
        supplierId: params.supplier,
        from: params.from,
        to: params.to,
        q: params.q,
      })
    : null
  const payables = billWise?.payables ?? []
  const commitments = billWise?.commitments ?? []
  const billWiseFailures = [...supplierSourceWarning, ...(billWise?.failedSources ?? [])]
  const totalOutstanding = payables.reduce((sum, row) => sum + row.outstanding, 0)
  const totalCommitments = commitments.reduce((sum, row) => sum + row.amount, 0)

  const todayKw = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuwait' })
  const allForAgeing = payables.map((row) => ({
    balance_due: row.outstanding,
    due_date: row.dueDate,
  }))
  const ageing = allForAgeing.reduce(
    (acc, item) => {
      if (!item.due_date) { acc.current += item.balance_due; return acc }
      const days = daysBetweenIso(item.due_date, todayKw)
      if (days <= 0) acc.current += item.balance_due
      else if (days <= 30) acc.d30 += item.balance_due
      else if (days <= 60) acc.d60 += item.balance_due
      else if (days <= 90) acc.d90 += item.balance_due
      else acc.d90plus += item.balance_due
      return acc
    },
    { current: 0, d30: 0, d60: 0, d90: 0, d90plus: 0 }
  )

  const pStatusColor: Record<string, string> = {
    opening: 'bg-amber-100 text-amber-700',
    unpaid: 'bg-red-100 text-red-700',
    partial: 'bg-amber-100 text-amber-700',
    paid: 'bg-green-100 text-green-700',
  }

  // Dr/Cr running-balance ledger (Cash Book pattern). Built only for that view;
  // the bill-wise view above is untouched.
  const ledger = view === 'ledger'
    ? await buildVendorLedger(admin, orgId, {
        supplierId: params.supplier,
        from: params.from,
        to: params.to,
      })
    : null

  const selectedSupplierName = params.supplier
    ? allSuppliers.find((s) => s.id === params.supplier)?.supplier_name
    : undefined

  // Vendor-wise bill-wise outstanding, grouped per vendor with a running balance.
  const asOn = params.as_on && params.as_on <= todayKw ? params.as_on : todayKw
  const vendorWise = view === 'vendorwise'
    ? await buildVendorWiseOutstanding(admin, orgId, { supplierId: params.supplier, asOn, q: params.q })
    : null

  // Preserve every active filter when switching views.
  const viewHref = (v: View) => {
    const sp = new URLSearchParams()
    if (params.supplier) sp.set('supplier', params.supplier)
    if (params.from) sp.set('from', params.from)
    if (params.to) sp.set('to', params.to)
    if (params.q) sp.set('q', params.q)
    if (params.as_on) sp.set('as_on', params.as_on)
    if (v !== 'bills') sp.set('view', v)
    const qs = sp.toString()
    return `/suppliers/vendor-outstanding${qs ? `?${qs}` : ''}`
  }

  return (
    <div className="animate-fade-in">
      <div className="hidden print:block px-8 pt-8">
        <OrgLetterhead
          title={
            view === 'ledger' ? 'Vendor Ledger'
            : view === 'vendorwise' ? 'Bill-wise Outstanding Vendor'
            : 'Vendor Bill-wise Outstanding'
          }
          subtitle={view === 'vendorwise' ? `As On ${formatDate(asOn)}` : `As of ${new Date().toLocaleDateString('en-GB')}`}
        />
      </div>
      <Header
        title={
          view === 'ledger' ? 'Vendor Ledger'
          : view === 'vendorwise' ? 'Bill-wise Outstanding Vendor'
          : 'Vendor Bill-wise Outstanding'
        }
        subtitle={
          view === 'ledger' ? 'Debit / credit running balance per vendor'
          : view === 'vendorwise' ? 'Outstanding bills grouped by vendor with running balance'
          : 'Supplier bills with pending balances'
        }
        actions={
          <div className="flex items-center gap-2 print:hidden">
            <SupplierFilter suppliers={allSuppliers} selectedId={params.supplier} />
            <Link href={withReturnTo('/suppliers/opening-payables', outstandingPath)} className="px-3 py-2 border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition-colors">
              Opening Payables
            </Link>
            <PrintActions />
          </div>
        }
      />

      <div className="p-6 space-y-5">
        <div className="flex flex-wrap items-center gap-3 print:hidden">
          <div className="flex gap-1.5">
            {([
              { label: 'Bill-wise', value: 'bills' as const },
              { label: 'Vendor-wise', value: 'vendorwise' as const },
              { label: 'Ledger (Dr/Cr)', value: 'ledger' as const },
            ]).map(({ label, value }) => (
              <Link
                key={value}
                href={viewHref(value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  view === value
                    ? 'bg-slate-900 text-white'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {label}
              </Link>
            ))}
          </div>
          {view === 'vendorwise' ? (
            <Suspense>
              <AsOnFilter asOn={asOn} today={todayKw} />
            </Suspense>
          ) : (
            <Suspense>
              <DateRangeFilter basePath="/suppliers/vendor-outstanding" from={params.from} to={params.to} label={view === 'ledger' ? 'Date' : 'Bill Date'} />
            </Suspense>
          )}
          {view !== 'ledger' && (
            <Suspense>
              <SearchBar basePath="/suppliers/vendor-outstanding" placeholder="Search bill, PO, supplier…" />
            </Suspense>
          )}
          {supplierSourceWarning.length > 0 && view !== 'bills' && (
            <div className="flex gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 basis-full">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span><strong>The supplier selector is incomplete.</strong> {supplierSourceWarning.join(', ')}.</span>
            </div>
          )}
        </div>

        {vendorWise && <VendorWiseOutstandingTable report={vendorWise} returnTo={outstandingPath} />}

        {ledger && (
          <VendorLedgerTable
            ledger={ledger}
            showSupplier={!params.supplier}
            supplierName={selectedSupplierName}
          />
        )}

        {view === 'bills' && (<>
        {billWiseFailures.length > 0 && (
          <div className="flex gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>
              <strong>These figures are incomplete.</strong> Could not fully load: {billWiseFailures.join(', ')}.
              The totals below are not reliable until this is resolved.
            </span>
          </div>
        )}
        {/* Ageing summary */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: 'Not Due', value: ageing.current, color: 'text-green-600' },
            { label: '1–30 Days', value: ageing.d30, color: 'text-amber-600' },
            { label: '31–60 Days', value: ageing.d60, color: 'text-orange-600' },
            { label: '61–90 Days', value: ageing.d90, color: 'text-red-600' },
            { label: '90+ Days', value: ageing.d90plus, color: 'text-red-800' },
          ].map((b) => (
            <div key={b.label} className="bg-white rounded-xl border border-slate-200 p-4 text-center">
              <p className="text-xs text-slate-500 font-medium mb-1">{b.label}</p>
              <p className={`text-base font-bold ${b.color}`}>{formatCurrency(b.value)}</p>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">
              Accounts Payable Bills
              <span className="ml-2 text-sm font-normal text-slate-500">({payables.length})</span>
            </h3>
            <p className="text-sm font-bold text-red-600">AP Total: {formatCurrency(totalOutstanding)}</p>
          </div>

          {payables.length === 0 ? (
            <div className="p-10 text-center">
              <AlertCircle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-400">No outstanding supplier bills</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Bill #</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Supplier</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Date</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Due Date</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Status</th>
                    <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Total</th>
                    <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Paid</th>
                    <th className="text-right text-xs font-semibold text-red-600 uppercase tracking-wider px-5 py-3">Outstanding</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {payables.map((payable) => {
                    const isOverdue = payable.dueDate ? payable.dueDate < todayKw : false
                    const rowClass = payable.kind === 'opening'
                      ? 'bg-amber-50/40 hover:bg-amber-50 transition-colors'
                      : 'hover:bg-slate-50 transition-colors'
                    return (
                      <tr key={`${payable.kind}-${payable.id}`} className={rowClass}>
                        <td className="px-5 py-3">
                          {payable.href ? (
                            <DocumentLink href={withReturnTo(payable.href, outstandingPath)} tabLabel={payable.number} className="text-sm font-mono text-blue-600 hover:text-blue-700 font-semibold">
                              {payable.number}
                            </DocumentLink>
                          ) : (
                            <span className="text-sm font-mono text-amber-700 font-semibold">{payable.number}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm font-semibold text-slate-800">{payable.supplierName}</p>
                          {payable.supplierCode && <p className="text-xs text-slate-400">{payable.supplierCode}</p>}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">{formatDate(payable.date)}</td>
                        <td className={`px-4 py-3 text-sm ${isOverdue ? 'text-red-600 font-semibold' : 'text-slate-600'}`}>
                          {payable.dueDate ? formatDate(payable.dueDate) : '—'}
                          {isOverdue && <span className="ml-1 text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">Overdue</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${pStatusColor[payable.paymentStatus] ?? 'bg-slate-100 text-slate-600'}`}>
                            {payable.paymentStatus === 'opening' ? 'Opening Bal' : payable.paymentStatus}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-slate-700">{formatCurrency(payable.total)}</td>
                        <td className="px-4 py-3 text-right text-sm text-green-700">{payable.paid > 0 ? formatCurrency(payable.paid) : '—'}</td>
                        <td className="px-5 py-3 text-right text-sm font-bold text-red-600">{formatCurrency(payable.outstanding)}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 border-t border-slate-200">
                    <td colSpan={5} className="px-5 py-3 text-sm font-bold text-slate-700">AP Total</td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-slate-900">
                      {formatCurrency(payables.reduce((sum, row) => sum + row.total, 0))}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-green-700">
                      {formatCurrency(payables.reduce((sum, row) => sum + row.paid, 0))}
                    </td>
                    <td className="px-5 py-3 text-right text-sm font-bold text-red-600">{formatCurrency(totalOutstanding)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-indigo-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-indigo-100 bg-indigo-50/60 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-indigo-900">
                Purchase Order Commitments
                <span className="ml-2 text-sm font-normal text-indigo-600">({commitments.length})</span>
              </h3>
              <p className="mt-0.5 text-xs text-indigo-600">Operational commitments only — excluded from Accounts Payable totals and ageing.</p>
            </div>
            <p className="text-sm font-bold text-indigo-700">Commitment Total: {formatCurrency(totalCommitments)}</p>
          </div>

          {commitments.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">No open purchase order commitments</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead>
                  <tr className="bg-indigo-50 border-b border-indigo-100">
                    <th className="text-left text-xs font-semibold text-indigo-700 uppercase tracking-wider px-5 py-3">PO #</th>
                    <th className="text-left text-xs font-semibold text-indigo-700 uppercase tracking-wider px-4 py-3">Supplier</th>
                    <th className="text-left text-xs font-semibold text-indigo-700 uppercase tracking-wider px-4 py-3">Date</th>
                    <th className="text-left text-xs font-semibold text-indigo-700 uppercase tracking-wider px-4 py-3">Due Date</th>
                    <th className="text-right text-xs font-semibold text-indigo-700 uppercase tracking-wider px-5 py-3">Commitment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-indigo-50">
                  {commitments.map((commitment) => (
                    <tr key={commitment.id} className="hover:bg-indigo-50/50 transition-colors">
                      <td className="px-5 py-3">
                        <DocumentLink href={withReturnTo(commitment.href, outstandingPath)} tabLabel={commitment.number} className="text-sm font-mono text-indigo-600 hover:text-indigo-700 font-semibold">
                          {commitment.number}
                        </DocumentLink>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-semibold text-slate-800">{commitment.supplierName}</p>
                        {commitment.supplierCode && <p className="text-xs text-slate-400">{commitment.supplierCode}</p>}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">{formatDate(commitment.date)}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{commitment.dueDate ? formatDate(commitment.dueDate) : '—'}</td>
                      <td className="px-5 py-3 text-right text-sm font-bold text-indigo-700">{formatCurrency(commitment.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        </>)}
      </div>
    </div>
  )
}
