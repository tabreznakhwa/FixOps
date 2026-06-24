import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Package, AlertTriangle, TrendingUp } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { InventoryActions } from './InventoryActions'

export const metadata = { title: 'Inventory Item' }

export default async function InventoryItemPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  const { data: profileRaw } = await (supabase as any).from('users').select('role').eq('id', user!.id).single()
  const isTechnician = ((profileRaw as { role: string } | null)?.role ?? '') === 'technician'

  const { data: itemRaw } = await supabase
    .from('inventory_items')
    .select(
      'id, item_code, item_name, category, brand, unit_of_measure, current_stock, minimum_stock_level, purchase_price, selling_price, storage_location, is_active',
    )
    .eq('id', id)
    .single()

  if (!itemRaw) notFound()

  const item = itemRaw as unknown as {
    id: string
    item_code: string
    item_name: string
    category: string | null
    brand: string | null
    unit_of_measure: string
    current_stock: number
    minimum_stock_level: number
    purchase_price: number
    selling_price: number
    storage_location: string | null
    is_active: boolean
  }

  const isLowStock = item.current_stock <= item.minimum_stock_level
  const margin =
    item.selling_price > 0
      ? ((item.selling_price - item.purchase_price) / item.selling_price) * 100
      : 0
  const stockValue = item.current_stock * item.purchase_price

  return (
    <div className="animate-fade-in">
      <Header
        title={item.item_name}
        subtitle={item.item_code}
        actions={
          <Link
            href="/inventory"
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </Link>
        }
      />

      <div className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Main column */}
          <div className="lg:col-span-2 space-y-5">
            {/* Item details */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isLowStock ? 'bg-red-50' : 'bg-slate-100'}`}>
                  <Package className={`w-5 h-5 ${isLowStock ? 'text-red-500' : 'text-slate-500'}`} />
                </div>
                <div>
                  <p className="text-lg font-bold text-slate-900">{item.item_name}</p>
                  <p className="text-sm font-mono text-slate-400">{item.item_code}</p>
                </div>
                {!item.is_active && (
                  <span className="ml-auto text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">
                    Inactive
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                {item.category && (
                  <div>
                    <p className="text-xs text-slate-400 mb-0.5">Category</p>
                    <span className="text-sm font-semibold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-lg">
                      {item.category}
                    </span>
                  </div>
                )}
                {item.brand && (
                  <div>
                    <p className="text-xs text-slate-400 mb-0.5">Brand</p>
                    <p className="text-sm font-semibold text-slate-900">{item.brand}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-slate-400 mb-0.5">Unit of Measure</p>
                  <p className="text-sm font-semibold text-slate-900 uppercase">{item.unit_of_measure}</p>
                </div>
                {item.storage_location && (
                  <div>
                    <p className="text-xs text-slate-400 mb-0.5">Storage Location</p>
                    <p className="text-sm font-semibold text-slate-900">{item.storage_location}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Stock card */}
            <div className={`bg-white rounded-xl border ${isLowStock ? 'border-red-200' : 'border-slate-200'} p-5`}>
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Stock Level</h3>
              {isLowStock && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">
                  <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <p className="text-sm font-medium text-red-700">
                    Low stock alert — below minimum level
                  </p>
                </div>
              )}
              <div className={`grid gap-4 ${isTechnician ? 'grid-cols-2' : 'grid-cols-3'}`}>
                <div className="text-center">
                  <p className={`text-3xl font-bold ${isLowStock ? 'text-red-600' : 'text-slate-900'}`}>
                    {item.current_stock}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">Current Stock</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-slate-400">{item.minimum_stock_level}</p>
                  <p className="text-xs text-slate-400 mt-0.5">Minimum Level</p>
                </div>
                {!isTechnician && (
                  <div className="text-center">
                    <p className="text-xl font-bold text-slate-700">{formatCurrency(stockValue)}</p>
                    <p className="text-xs text-slate-400 mt-0.5">Stock Value</p>
                  </div>
                )}
              </div>
            </div>

            {/* Pricing — hidden for technicians */}
            {!isTechnician && (
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Pricing</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-slate-400 mb-0.5">Purchase Price</p>
                    <p className="text-lg font-bold text-slate-900">{formatCurrency(item.purchase_price)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 mb-0.5">Selling Price</p>
                    <p className="text-lg font-bold text-slate-900">{formatCurrency(item.selling_price)}</p>
                  </div>
                  <div>
                    <div className="flex items-center gap-1 mb-0.5">
                      <TrendingUp className="w-3 h-3 text-green-500" />
                      <p className="text-xs text-slate-400">Margin</p>
                    </div>
                    <p className="text-lg font-bold text-green-600">{margin.toFixed(1)}%</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right column — hidden for technicians */}
          {!isTechnician && (
            <div>
              <InventoryActions
                itemId={item.id}
                currentStock={item.current_stock}
                unitOfMeasure={item.unit_of_measure}
                isActive={item.is_active}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
