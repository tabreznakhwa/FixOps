import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import { Plus, Package, AlertTriangle, Search } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

export const metadata = { title: 'Inventory' }

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ q?: string; filter?: string }> }) {
  const params = await searchParams
  const supabase = await createClient()

  let query = supabase
    .from('inventory_items')
    .select('id, item_code, item_name, category, brand, unit_of_measure, current_stock, minimum_stock_level, purchase_price, selling_price, storage_location, is_active')
    .eq('is_active', true)
    .order('item_name')

  if (params.q) query = query.ilike('item_name', `%${params.q}%`)
  if (params.filter === 'low') query = query.filter('current_stock', 'lte', 'minimum_stock_level')

  const { data: itemsRaw } = await query.limit(50)
  const items = itemsRaw as unknown as Array<{
    id: string; item_code: string; item_name: string; category: string | null; brand: string | null;
    unit_of_measure: string; current_stock: number; minimum_stock_level: number;
    purchase_price: number; selling_price: number; storage_location: string | null; is_active: boolean
  }>

  const lowStockCount = items?.filter((i) => i.current_stock <= i.minimum_stock_level).length ?? 0
  const totalValue = items?.reduce((s, i) => s + i.current_stock * i.purchase_price, 0) ?? 0

  return (
    <div className="animate-fade-in">
      <Header
        title="Inventory"
        subtitle="Parts and materials management"
        actions={
          <Link
            href="/inventory/new"
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Item
          </Link>
        }
      />

      <div className="p-6 space-y-5">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Items', value: items?.length ?? 0, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: 'Low Stock', value: lowStockCount, color: 'text-red-600', bg: 'bg-red-50', alert: lowStockCount > 0 },
            { label: 'Stock Value', value: formatCurrency(totalValue), color: 'text-green-600', bg: 'bg-green-50', isText: true },
            { label: 'Categories', value: [...new Set(items?.map((i) => i.category).filter(Boolean))].length, color: 'text-purple-600', bg: 'bg-purple-50' },
          ].map(({ label, value, color, bg, alert, isText }) => (
            <div key={label} className={`bg-white rounded-xl border ${alert ? 'border-red-200' : 'border-slate-200'} p-4`}>
              <p className={`font-bold text-slate-900 ${isText ? 'text-lg' : 'text-2xl'}`}>{value}</p>
              <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                {alert && <AlertTriangle className="w-3 h-3 text-red-500" />}
                {label}
              </p>
            </div>
          ))}
        </div>

        {/* Search + Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <form className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              name="q"
              defaultValue={params.q}
              placeholder="Search items..."
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </form>
          <Link
            href={params.filter === 'low' ? '/inventory' : '/inventory?filter=low'}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
              params.filter === 'low' ? 'bg-red-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-red-50 hover:border-red-200 hover:text-red-600'
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
            Low Stock {lowStockCount > 0 && `(${lowStockCount})`}
          </Link>
        </div>

        {/* Inventory Table */}
        {!items?.length ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <Package className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No inventory items</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Item</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 hidden md:table-cell">Category</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Stock</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 hidden lg:table-cell">Purchase Price</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 hidden lg:table-cell">Selling Price</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 hidden md:table-cell">Location</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {items.map((item) => {
                  const isLow = item.current_stock <= item.minimum_stock_level
                  return (
                    <tr key={item.id} className={`hover:bg-slate-50 transition-colors group ${isLow ? 'bg-red-50/30' : ''}`}>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isLow ? 'bg-red-100' : 'bg-slate-100'}`}>
                            <Package className={`w-4 h-4 ${isLow ? 'text-red-500' : 'text-slate-500'}`} />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-800 group-hover:text-blue-700 transition-colors">
                              {item.item_name}
                            </p>
                            <p className="text-xs text-slate-400 font-mono">{item.item_code}</p>
                            {item.brand && <p className="text-xs text-slate-500">{item.brand}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 hidden md:table-cell">
                        <span className="text-xs font-medium bg-slate-100 text-slate-700 px-2 py-1 rounded-lg capitalize">
                          {item.category ?? '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <p className={`text-sm font-bold ${isLow ? 'text-red-600' : 'text-slate-900'}`}>
                          {item.current_stock} {item.unit_of_measure}
                        </p>
                        {isLow && (
                          <p className="text-xs text-red-500 flex items-center justify-end gap-1 mt-0.5">
                            <AlertTriangle className="w-3 h-3" /> Min: {item.minimum_stock_level}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right hidden lg:table-cell text-sm text-slate-600">
                        {formatCurrency(item.purchase_price)}
                      </td>
                      <td className="px-4 py-3.5 text-right hidden lg:table-cell text-sm font-semibold text-slate-900">
                        {formatCurrency(item.selling_price)}
                      </td>
                      <td className="px-4 py-3.5 hidden md:table-cell text-sm text-slate-600">
                        {item.storage_location ?? '—'}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <Link
                          href={`/inventory/${item.id}`}
                          className="text-xs text-blue-600 hover:text-blue-700 font-medium opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          View →
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
