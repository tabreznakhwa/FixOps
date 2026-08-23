'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { FileText, Clock, AlertCircle, CheckCircle2, Pencil, Printer } from 'lucide-react'
import { formatCurrency, formatDate, getStatusColor, formatStatus } from '@/lib/utils'
import { DeleteInvoiceButton } from './DeleteInvoiceButton'

interface Invoice {
  id: string
  invoice_number: string
  invoice_date: string
  due_date: string | null
  total_amount: number
  amount_paid: number
  balance_due: number
  status: string
  invoice_type: string
  notes: string | null
  customers: { full_name: string; mobile_number: string } | null
}

const statusIcons: Record<string, React.ReactNode> = {
  paid: <CheckCircle2 className="w-3.5 h-3.5" />,
  overdue: <AlertCircle className="w-3.5 h-3.5" />,
  partial: <Clock className="w-3.5 h-3.5" />,
}

/**
 * The Invoices list table plus batch selection — checkboxes per row and a
 * "Print / Save PDF" sticky bar, same pattern and same print-batch route as
 * the Receivables "Balance Invoices" selector.
 */
export function InvoiceTableClient({ invoices, canEditDelete }: { invoices: Invoice[]; canEditDelete: boolean }) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const allSelected = invoices.length > 0 && invoices.every(inv => selected.has(inv.id))

  const toggleOne = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(invoices.map(inv => inv.id)))
  }

  const printSelected = () => {
    router.push(`/finance/invoices/print-batch?ids=${Array.from(selected).join(',')}&return_to=/finance/invoices`)
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-100">
            <th className="px-4 py-3 w-8">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
            </th>
            <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Invoice</th>
            <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 hidden md:table-cell">Customer</th>
            <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 hidden lg:table-cell">Date</th>
            <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 hidden lg:table-cell">Due Date</th>
            <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Amount</th>
            <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Balance</th>
            <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Status</th>
            <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 hidden xl:table-cell">Notes</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {invoices.map((inv) => {
            const customer = inv.customers
            const isOverdue = inv.status === 'overdue'
            const canEdit = canEditDelete && !['paid', 'cancelled'].includes(inv.status)
            const canDelete = canEditDelete && !['paid', 'cancelled'].includes(inv.status)
            return (
              <tr key={inv.id} className={`hover:bg-slate-50 transition-colors group ${isOverdue ? 'bg-red-50/30' : ''}`}>
                <td className="px-4 py-3.5">
                  <input
                    type="checkbox"
                    checked={selected.has(inv.id)}
                    onChange={() => toggleOne(inv.id)}
                    className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                </td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-slate-400" />
                    <div>
                      <p className="text-sm font-mono font-semibold text-slate-900 group-hover:text-blue-700 transition-colors">
                        {inv.invoice_number}
                      </p>
                      <p className="text-xs text-slate-400 capitalize">{inv.invoice_type}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3.5 hidden md:table-cell text-sm text-slate-700">
                  {customer?.full_name}
                </td>
                <td className="px-4 py-3.5 hidden lg:table-cell text-sm text-slate-600">
                  {formatDate(inv.invoice_date)}
                </td>
                <td className={`px-4 py-3.5 hidden lg:table-cell text-sm ${isOverdue ? 'text-red-600 font-semibold' : 'text-slate-600'}`}>
                  {inv.due_date ? formatDate(inv.due_date) : '—'}
                </td>
                <td className="px-4 py-3.5 text-right">
                  <p className="text-sm font-bold text-slate-900">{formatCurrency(inv.total_amount)}</p>
                  {inv.amount_paid > 0 && (
                    <p className="text-xs text-green-600">+{formatCurrency(inv.amount_paid)} paid</p>
                  )}
                </td>
                <td className="px-4 py-3.5 text-right">
                  {inv.status === 'paid' ? (
                    <p className="text-sm font-bold text-green-600">{formatCurrency(0)}</p>
                  ) : (
                    <p className={`text-sm font-bold ${inv.balance_due > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                      {formatCurrency(inv.balance_due)}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3.5">
                  <div className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${getStatusColor(inv.status)}`}>
                    {statusIcons[inv.status]}
                    {formatStatus(inv.status)}
                  </div>
                </td>
                <td className="px-4 py-3.5 hidden xl:table-cell text-sm text-slate-500 max-w-[160px] truncate">
                  {inv.notes ?? '—'}
                </td>
                <td className="px-4 py-3.5 text-right">
                  <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Link
                      href={`/finance/invoices/${inv.id}`}
                      className="text-xs text-blue-600 hover:text-blue-700 font-medium px-2 py-1"
                    >
                      View
                    </Link>
                    {canEdit && (
                      <Link
                        href={`/finance/invoices/${inv.id}/edit`}
                        className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Edit invoice"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Link>
                    )}
                    {canDelete && <DeleteInvoiceButton id={inv.id} status={inv.status} />}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {selected.size > 0 && (
        <div className="sticky bottom-0 left-0 right-0 bg-slate-900 text-white px-5 py-3 flex items-center justify-between shadow-lg">
          <span className="text-sm font-medium">{selected.size} invoice{selected.size === 1 ? '' : 's'} selected</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelected(new Set())}
              className="px-3 py-1.5 text-sm font-medium text-slate-300 hover:text-white transition-colors"
            >
              Clear
            </button>
            <button
              onClick={printSelected}
              className="flex items-center gap-2 px-4 py-1.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Printer className="w-4 h-4" /> Print / Save PDF
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
