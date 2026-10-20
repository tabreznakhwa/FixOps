'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, ChevronDown, Loader2 } from 'lucide-react'
import { WORK_ORDER_SERVICE_CATEGORIES } from '@/lib/workOrderCategories'

const inputCls = 'w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500'
const labelCls = 'block text-sm font-medium text-slate-700 mb-1.5'

type TechnicianWorkOrder = {
  id: string
  service_category: string | null
  job_description: string | null
  notes: string | null
}

export function TechnicianEditWorkOrderForm({
  wo,
  detailHref,
}: {
  wo: TechnicianWorkOrder
  detailHref: string
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError('')

    const formData = new FormData(event.currentTarget)
    try {
      const response = await fetch(`/api/work-orders/${wo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_category: formData.get('service_category'),
          job_description: formData.get('job_description'),
          notes: formData.get('notes'),
        }),
      })
      const data = await response.json().catch(() => null) as { error?: string } | null
      if (!response.ok) {
        setError(data?.error ?? 'Failed to update work order')
        return
      }

      router.replace(detailHref)
      router.refresh()
    } catch {
      setError('Failed to update work order')
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-700">Job Details</h2>
        <div>
          <label className={labelCls}>Service Category</label>
          <div className="relative">
            <select
              name="service_category"
              defaultValue={wo.service_category ?? ''}
              className={inputCls + ' appearance-none pr-9'}
            >
              <option value="">Not specified</option>
              {WORK_ORDER_SERVICE_CATEGORIES.map(category => (
                <option key={category.value} value={category.value}>{category.label}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
        </div>
        <div>
          <label className={labelCls}>Job Description <span className="text-red-500">*</span></label>
          <textarea
            name="job_description"
            required
            rows={4}
            defaultValue={wo.job_description ?? ''}
            className={inputCls + ' resize-none'}
          />
        </div>
        <div>
          <label className={labelCls}>Internal Notes</label>
          <textarea
            name="notes"
            rows={2}
            defaultValue={wo.notes ?? ''}
            className={inputCls + ' resize-none'}
          />
        </div>
      </div>

      <div className="flex items-center gap-3 pb-6">
        <button
          type="submit"
          disabled={pending}
          className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
        >
          {pending ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : 'Save Changes'}
        </button>
        <button
          type="button"
          onClick={() => router.replace(detailHref)}
          className="px-6 py-2.5 text-sm font-semibold text-slate-600 hover:text-slate-800 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
