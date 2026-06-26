'use client'

import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'

interface ExportInvoice {
  invoice_number: string
  invoice_date: string
  due_date: string | null
  status: string
  invoice_type: string
  subtotal: number
  discount_amount: number
  tax_amount: number
  total_amount: number
  amount_paid: number
  balance_due: number
  customer_name: string
}

interface Props {
  range: string
}

export function ReportExportButton({ range }: Props) {
  const [loading, setLoading] = useState(false)

  const handleExport = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/reports/export?range=${range}`)
      if (!res.ok) {
        const d = await res.json()
        alert(d.error ?? 'Export failed')
        return
      }
      const invoices: ExportInvoice[] = await res.json()

      const headers = [
        'Invoice Number',
        'Invoice Date',
        'Due Date',
        'Customer',
        'Type',
        'Status',
        'Subtotal (KWD)',
        'Discount (KWD)',
        'Tax (KWD)',
        'Total (KWD)',
        'Paid (KWD)',
        'Balance Due (KWD)',
      ]

      const rows = invoices.map((inv) => [
        inv.invoice_number,
        inv.invoice_date,
        inv.due_date ?? '',
        inv.customer_name,
        inv.invoice_type,
        inv.status,
        inv.subtotal.toFixed(2),
        inv.discount_amount.toFixed(2),
        inv.tax_amount.toFixed(2),
        inv.total_amount.toFixed(2),
        inv.amount_paid.toFixed(2),
        inv.balance_due.toFixed(2),
      ])

      const csvContent = [headers, ...rows]
        .map((row) =>
          row
            .map((cell) => {
              const s = String(cell ?? '')
              return s.includes(',') || s.includes('"') || s.includes('\n')
                ? `"${s.replace(/"/g, '""')}"`
                : s
            })
            .join(','),
        )
        .join('\n')

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `invoices-${range}-${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={loading}
      className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <Download className="w-4 h-4" />
      )}
      Export CSV
    </button>
  )
}
