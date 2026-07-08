'use client'

import { useRouter, useSearchParams } from 'next/navigation'

export function CategorySelect({
  basePath,
  categories,
  labelMap,
  value,
}: {
  basePath: string
  categories: string[]
  labelMap?: Record<string, string>
  value: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(searchParams.toString())
    if (e.target.value) params.set('category', e.target.value); else params.delete('category')
    router.push(`${basePath}?${params.toString()}`)
  }

  return (
    <select
      defaultValue={value}
      onChange={handleChange}
      className="px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
    >
      <option value="">All Categories</option>
      {categories.map((c) => (
        <option key={c} value={c}>{labelMap?.[c] ?? c}</option>
      ))}
    </select>
  )
}
