'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { ChevronDown } from 'lucide-react'

interface Props {
  categories: string[]
  brands: string[]
}

const selectCls =
  'appearance-none border border-slate-200 rounded-xl text-sm bg-white pl-3 pr-8 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer transition-colors'

export function InventoryFilters({ categories, brands }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const currentCategory = searchParams.get('category') ?? ''
  const currentBrand = searchParams.get('brand') ?? ''

  function navigate(key: 'category' | 'brand', value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    router.push(`/inventory?${params.toString()}`)
  }

  return (
    <>
      {categories.length > 0 && (
        <div className="relative">
          <select
            value={currentCategory}
            onChange={(e) => navigate('category', e.target.value)}
            className={`${selectCls} ${currentCategory ? 'border-blue-400 text-blue-700 bg-blue-50 font-semibold' : 'text-slate-600'}`}
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>
      )}

      {brands.length > 0 && (
        <div className="relative">
          <select
            value={currentBrand}
            onChange={(e) => navigate('brand', e.target.value)}
            className={`${selectCls} ${currentBrand ? 'border-blue-400 text-blue-700 bg-blue-50 font-semibold' : 'text-slate-600'}`}
          >
            <option value="">All Brands</option>
            {brands.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>
      )}
    </>
  )
}
