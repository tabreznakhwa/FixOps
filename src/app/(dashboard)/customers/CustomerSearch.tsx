'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useRef } from 'react'
import { Search } from 'lucide-react'

export function CustomerSearch() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const inputRef = useRef<HTMLInputElement>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const q = inputRef.current?.value.trim() ?? ''
    const sp = new URLSearchParams()
    if (q) sp.set('q', q)
    const type = searchParams.get('type')
    if (type) sp.set('type', type)
    router.push(`/customers${sp.toString() ? '?' + sp.toString() : ''}`)
  }

  return (
    <form onSubmit={handleSubmit} className="flex-1 relative flex gap-2">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          ref={inputRef}
          name="q"
          defaultValue={searchParams.get('q') ?? ''}
          placeholder="Search by name, company, mobile, or code..."
          className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <button type="submit"
        className="px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors">
        Search
      </button>
    </form>
  )
}
