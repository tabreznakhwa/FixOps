import Link from 'next/link'
import { formatCurrency, formatDate } from '@/lib/utils'
import { AlertCircle, AlertTriangle } from 'lucide-react'
import type { VendorWiseOutstanding } from './vendorWiseOutstanding'

function IncompleteWarning({ sources }: { sources: string[] }) {
  if (sources.length === 0) return null
  return (
    <div className="flex gap-2.5 bg-red-50 border border-red-200 text-red-800 rounded-xl px-4 py-3 text-sm mb-5">
      <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
      <span>
        <strong>These figures are incomplete.</strong> Could not load: {sources.join(', ')}.
        The outstanding totals below are not reliable until this is resolved.
      </span>
    </div>
  )
}

const KIND_BADGE: Record<string, string> = {
  opening: 'bg-amber-100 text-amber-700',
  invoice: 'bg-blue-100 text-blue-700',
  po: 'bg-slate-100 text-slate-600',
}
const KIND_LABEL: Record<string, string> = {
  opening: 'Opening',
  invoice: 'Invoice',
  po: 'PO',
}

/** Days-outstanding colouring, matching the ageing buckets used elsewhere. */
function intDaysClass(d: number): string {
  if (d <= 0) return 'text-slate-400'
  if (d <= 30) return 'text-amber-600'
  if (d <= 60) return 'text-orange-600'
  if (d <= 90) return 'text-red-600'
  return 'text-red-800 font-bold'
}

export function VendorWiseOutstandingTable({ report }: { report: VendorWiseOutstanding }) {
  const { groups, grandTotal, billCount, asOn, restated, failedSources } = report

  if (groups.length === 0) {
    return (
      <div>
        <IncompleteWarning sources={failedSources} />
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
          <AlertCircle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-400">No outstanding vendor bills as on {formatDate(asOn)}</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <IncompleteWarning sources={failedSources} />
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-semibold text-slate-900">
          Bill-wise Outstanding Vendor
          <span className="ml-2 text-sm font-normal text-slate-500">[As On {formatDate(asOn)}]</span>
        </h3>
        <span className="text-xs text-slate-500">
          {groups.length} vendor{groups.length !== 1 ? 's' : ''} · {billCount} bill{billCount !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px]">
          <thead>
            <tr className="bg-slate-800 text-white">
              <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-2.5">Party Code</th>
              <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-2.5">Bill No</th>
              <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-2.5">Date</th>
              <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-2.5">Ref No</th>
              <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-2.5">Due Date</th>
              <th className="text-right text-xs font-semibold uppercase tracking-wider px-4 py-2.5">Amount (KD)</th>
              <th className="text-right text-xs font-semibold uppercase tracking-wider px-4 py-2.5">Outstanding (KD)</th>
              <th className="text-right text-xs font-semibold uppercase tracking-wider px-4 py-2.5">Balance (KD)</th>
              <th className="text-right text-xs font-semibold uppercase tracking-wider px-4 py-2.5">Int. Days</th>
            </tr>
          </thead>

          {groups.map((g) => (
            <tbody key={g.supplierId} className="divide-y divide-slate-50 border-b-2 border-slate-200">
              <tr className="bg-slate-100">
                <td colSpan={9} className="px-4 py-2.5 text-sm font-bold text-slate-800">
                  Vendor: {g.supplierName}
                  {g.supplierCode && <span className="ml-2 text-xs font-normal text-slate-500">({g.supplierCode})</span>}
                </td>
              </tr>

              {g.bills.map((b) => (
                <tr key={`${b.kind}-${b.id}`} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-2.5 text-xs text-slate-400 font-mono">{g.supplierCode ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      {b.href ? (
                        <Link href={b.href} className="text-sm font-mono text-blue-600 hover:text-blue-700 font-semibold">
                          {b.billNo}
                        </Link>
                      ) : (
                        <span className="text-sm font-mono text-slate-700 font-semibold">{b.billNo}</span>
                      )}
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${KIND_BADGE[b.kind]}`}>
                        {KIND_LABEL[b.kind]}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-sm text-slate-600 whitespace-nowrap">{formatDate(b.billDate)}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-500 font-mono">{b.refNo ?? '—'}</td>
                  <td className="px-4 py-2.5 text-sm text-slate-600 whitespace-nowrap">
                    {b.dueDate ? formatDate(b.dueDate) : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right text-sm text-slate-700">{formatCurrency(b.amount)}</td>
                  <td className="px-4 py-2.5 text-right text-sm font-semibold text-red-600">
                    {formatCurrency(b.outstanding)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-sm font-bold text-slate-800">
                    {formatCurrency(b.balance)}
                  </td>
                  <td className={`px-4 py-2.5 text-right text-sm ${intDaysClass(b.intDays)}`}>{b.intDays}</td>
                </tr>
              ))}

              <tr className="bg-slate-50">
                <td colSpan={7} className="px-4 py-2.5 text-right text-sm font-bold text-slate-600">
                  Total — {g.supplierName}
                </td>
                <td className="px-4 py-2.5 text-right text-sm font-bold text-slate-900">{formatCurrency(g.total)}</td>
                <td className="px-4 py-2.5" />
              </tr>
            </tbody>
          ))}

          <tfoot>
            <tr className="bg-slate-800 text-white">
              <td colSpan={7} className="px-4 py-3 text-right text-sm font-bold">Grand Total</td>
              <td className="px-4 py-3 text-right text-sm font-bold">{formatCurrency(grandTotal)}</td>
              <td className="px-4 py-3" />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/60">
        <p className="text-xs text-slate-400">
          Balance is the running total within each vendor. Int. Days counts from the due date
          (or bill date when none is set) to the as-on date, inclusive.
          {restated && ' Outstanding figures are restated to the as-on date by adding back later settlements.'}
        </p>
      </div>
      </div>
    </div>
  )
}
