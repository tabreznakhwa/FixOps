'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'

export function CancelPurchaseInvoiceButton({ id, redirect }: { id: string; redirect?: boolean }) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleCancel() {
    if (!confirm('Cancel this purchase invoice? This action cannot be undone.')) return
    setLoading(true)
    await fetch(`/api/purchase-invoices/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cancel' }),
    })
    if (redirect) router.push('/inventory/purchase-invoices')
    else router.refresh()
    setLoading(false)
  }

  return (
    <button
      onClick={handleCancel}
      disabled={loading}
      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
      title="Cancel invoice"
    >
      <X className="w-4 h-4" />
    </button>
  )
}
