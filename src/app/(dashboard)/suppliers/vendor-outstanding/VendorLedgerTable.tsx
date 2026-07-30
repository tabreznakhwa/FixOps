import { formatCurrency, formatDate } from '@/lib/utils'
import { BookOpen, TrendingDown, TrendingUp } from 'lucide-react'
import type { VendorLedger } from './vendorLedger'

/**
 * Payables ledger in Cash Book form: Dr / Cr / running balance with an
 * "Opening Balance b/f" row so a date-filtered view still reconciles.
 */
export function VendorLedgerTable({
  ledger,
  showSupplier,
  supplierName,
}: {
  ledger: VendorLedger
  /** Hidden when the page is already filtered to a single supplier. */
  showSupplier: boolean
  supplierName?: string
}) {
  const {
    entries, periodOpeningBalance, periodOpeningDate,
    periodDebit, periodCredit, closingBalance, allTime,
  } = ledger

  const periodLabel = allTime ? 'All time' : 'Selected period'
  const cols = showSupplier ? 4 : 3

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-red-500" />
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Period Purchases</p>
          </div>
          <p className="text-xl font-bold text-red-500">{formatCurrency(periodCredit)}</p>
          <p className="text-xs text-slate-400 mt-1">{periodLabel} · billed to us</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingDown className="w-4 h-4 text-green-600" />
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Period Payments</p>
          </div>
          <p className="text-xl font-bold text-green-600">{formatCurrency(periodDebit)}</p>
          <p className="text-xs text-slate-400 mt-1">{periodLabel} · paid &amp; discounts</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <BookOpen className="w-4 h-4 text-blue-600" />
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Closing Payable</p>
          </div>
          <p className={`text-xl font-bold ${closingBalance >= 0 ? 'text-blue-600' : 'text-green-600'}`}>
            {formatCurrency(Math.abs(closingBalance))}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {closingBalance > 0 ? 'Amount we owe (all time)' : closingBalance < 0 ? 'Advance / credit with vendor' : 'Settled'}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">
            Vendor Ledger{supplierName ? ` — ${supplierName}` : ''}
          </h3>
          <span className="text-xs text-slate-500">{entries.length} entries · {periodLabel}</span>
        </div>

        {entries.length === 0 ? (
          <div className="p-10 text-center">
            <BookOpen className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-400">No vendor transactions in this period</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Date</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Narration</th>
                  {showSupplier && (
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Supplier</th>
                  )}
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Ref</th>
                  <th className="text-right text-xs font-semibold text-green-700 uppercase tracking-wider px-4 py-3">Payments (Dr)</th>
                  <th className="text-right text-xs font-semibold text-red-600 uppercase tracking-wider px-4 py-3">Purchases (Cr)</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {(() => {
                  let running = periodOpeningBalance
                  return [
                    <tr key="opening" className="bg-blue-50">
                      <td className="px-5 py-3 text-sm text-slate-500 whitespace-nowrap">
                        {periodOpeningDate ? formatDate(periodOpeningDate) : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-blue-700">Opening Balance b/f</td>
                      {showSupplier && <td className="px-4 py-3 text-sm text-slate-400">—</td>}
                      <td className="px-4 py-3 text-xs text-slate-400 font-mono">—</td>
                      <td className="px-4 py-3 text-right text-sm text-slate-400">—</td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-blue-700">
                        {formatCurrency(periodOpeningBalance)}
                      </td>
                      <td className="px-5 py-3 text-right text-sm font-bold text-blue-700">
                        {formatCurrency(periodOpeningBalance)}
                      </td>
                    </tr>,
                    ...entries.map((e, i) => {
                      running += e.credit - e.debit
                      return (
                        <tr key={i} className="hover:bg-slate-50 transition-colors">
                          <td className="px-5 py-3 text-sm text-slate-600 whitespace-nowrap">{formatDate(e.date)}</td>
                          <td className="px-4 py-3 text-sm text-slate-800">{e.narration}</td>
                          {showSupplier && (
                            <td className="px-4 py-3 text-sm text-slate-600">{e.supplier}</td>
                          )}
                          <td className="px-4 py-3 text-xs text-slate-400 font-mono">{e.ref}</td>
                          <td className="px-4 py-3 text-right text-sm font-medium text-green-700">
                            {e.debit > 0 ? formatCurrency(e.debit) : '—'}
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-medium text-red-600">
                            {e.credit > 0 ? formatCurrency(e.credit) : '—'}
                          </td>
                          <td className={`px-5 py-3 text-right text-sm font-bold ${running >= 0 ? 'text-slate-800' : 'text-green-600'}`}>
                            {formatCurrency(running)}
                          </td>
                        </tr>
                      )
                    }),
                  ]
                })()}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 border-t border-slate-200">
                  <td colSpan={cols} className="px-5 py-3 text-sm font-bold text-slate-700">Period Total</td>
                  <td className="px-4 py-3 text-right text-sm font-bold text-green-700">{formatCurrency(periodDebit)}</td>
                  <td className="px-4 py-3 text-right text-sm font-bold text-red-600">{formatCurrency(periodCredit)}</td>
                  {(() => {
                    const pb = periodOpeningBalance + periodCredit - periodDebit
                    return (
                      <td className={`px-5 py-3 text-right text-sm font-bold ${pb >= 0 ? 'text-blue-700' : 'text-green-600'}`}>
                        {formatCurrency(pb)}
                      </td>
                    )
                  })()}
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/60">
          <p className="text-xs text-slate-400">
            Purchases (opening payables, POs and purchase invoices) are credited; payments, discounts
            and advances are debited. Balance = amount owed to the vendor.
          </p>
        </div>
      </div>
    </div>
  )
}
