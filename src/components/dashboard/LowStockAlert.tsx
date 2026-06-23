import Link from 'next/link'
import { Package, AlertTriangle } from 'lucide-react'

interface StockItem {
  id: string
  item_name: string
  current_stock: number
  minimum_stock_level: number
  unit_of_measure: string
}

export function LowStockAlert({ items }: { items: StockItem[] }) {
  if (items.length === 0) return null

  return (
    <div className="bg-white rounded-xl border border-orange-200 p-5">
      <div className="flex items-center gap-2 mb-4">
        <AlertTriangle className="w-4 h-4 text-orange-500" />
        <h3 className="font-semibold text-slate-900">Low Stock Alert</h3>
        <span className="ml-auto text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">
          {items.length} items
        </span>
      </div>

      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Package className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
              <span className="text-sm text-slate-700 truncate">{item.item_name}</span>
            </div>
            <span className="text-xs font-semibold text-red-600 flex-shrink-0">
              {item.current_stock} {item.unit_of_measure}
            </span>
          </div>
        ))}
      </div>

      <Link
        href="/inventory"
        className="mt-3 block text-center text-xs text-orange-600 hover:text-orange-700 font-medium"
      >
        View inventory →
      </Link>
    </div>
  )
}
