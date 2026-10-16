'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, X } from 'lucide-react'
import { safeReturnTo } from '@/lib/backNav'

export function CancelPurchaseInvoiceButton({ id, redirectHref }: { id: string; redirectHref?: string }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  async function handleCancel() {
    if (!confirm('Cancel this purchase invoice? This action cannot be undone.')) return

    setError('')
    setLoading(true)
    try {
      const response = await fetch(`/api/purchase-invoices/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      })
      const payload = await response.json().catch(() => null) as { error?: string } | null

      if (!response.ok) {
        setError(payload?.error ?? 'Failed to cancel purchase invoice')
        return
      }

      const destination = safeReturnTo(redirectHref)
      if (destination) router.replace(destination)
      router.refresh()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleCancel}
        disabled={loading}
        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
        title="Cancel invoice"
      >
        <X className="w-4 h-4" />
      </button>
      {error && (
        <p className="flex max-w-xs items-start gap-1 text-right text-xs text-red-600" role="alert">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </div>
  )
}
