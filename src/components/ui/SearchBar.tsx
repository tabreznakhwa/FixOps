'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useRef } from 'react'
import { Search, X } from 'lucide-react'

export function SearchBar({ basePath, placeholder = 'Search…' }: { basePath: string; placeholder?: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [value, setValue] = useState(searchParams.get('q') ?? '')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function navigate(q: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (q.trim()) params.set('q', q.trim()); else params.delete('q')
    params.delete('page')
    router.push(`${basePath}?${params.toString()}`)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value
    setValue(v)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => navigate(v), 400)
  }

  function handleClear() {
    setValue('')
    if (timer.current) clearTimeout(timer.current)
    navigate('')
  }

  return (
    <div className="relative flex items-center">
      <Search className="absolute left-3 w-4 h-4 text-slate-400 pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        className="pl-9 pr-8 py-2 rounded-lg border border-slate-200 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white w-60"
      />
      {value && (
        <button onClick={handleClear} className="absolute right-2.5 p-0.5 text-slate-400 hover:text-slate-600 rounded">
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}
