import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import { Plus, Search, Phone, MapPin, Building2, User } from 'lucide-react'
import { formatDate, getStatusColor } from '@/lib/utils'

export const metadata = { title: 'Customers' }

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; type?: string }> }) {
  const params = await searchParams
  const supabase = await createClient()

  let query = supabase
    .from('customers')
    .select('id, customer_code, full_name, company_name, customer_type, mobile_number, area, city, status, advance_balance, created_at')
    .order('created_at', { ascending: false })

  if (params.q) {
    query = query.or(`full_name.ilike.%${params.q}%,company_name.ilike.%${params.q}%,mobile_number.ilike.%${params.q}%,customer_code.ilike.%${params.q}%`)
  }
  if (params.type) {
    query = query.eq('customer_type', params.type)
  }

  const { data: customersRaw } = await query.limit(50)
  const customers = customersRaw as unknown as Array<{
    id: string; customer_code: string; full_name: string; company_name: string | null;
    customer_type: string; mobile_number: string; area: string | null; city: string | null;
    status: string; advance_balance: number; created_at: string
  }>

  const typeColors: Record<string, string> = {
    individual: 'bg-blue-100 text-blue-700',
    company: 'bg-purple-100 text-purple-700',
    amc: 'bg-green-100 text-green-700',
    one_time: 'bg-slate-100 text-slate-700',
    credit: 'bg-amber-100 text-amber-700',
  }

  return (
    <div className="animate-fade-in">
      <Header
        title="Customers"
        subtitle={`${customers?.length ?? 0} customers`}
        actions={
          <Link
            href="/customers/new"
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Customer
          </Link>
        }
      />

      <div className="p-6 space-y-4">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <form className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              name="q"
              defaultValue={params.q}
              placeholder="Search by name, company, mobile..."
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </form>

          <div className="flex gap-2 flex-wrap">
            {['individual', 'company', 'amc', 'one_time', 'credit'].map((t) => (
              <Link
                key={t}
                href={params.type === t ? '/customers' : `/customers?type=${t}`}
                className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors capitalize ${
                  params.type === t ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {t.replace('_', ' ')}
              </Link>
            ))}
          </div>
        </div>

        {/* Customer Cards */}
        {customers?.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <Building2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No customers found</p>
            <p className="text-slate-400 text-sm mt-1">Add your first customer to get started</p>
            <Link
              href="/customers/new"
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" /> Add Customer
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Customer</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 hidden md:table-cell">Contact</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 hidden lg:table-cell">Location</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Type</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 hidden sm:table-cell">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {customers?.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                          {(c.full_name || c.company_name || 'C').slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-800 group-hover:text-blue-700 transition-colors">
                            {c.full_name}
                          </p>
                          {c.company_name && (
                            <p className="text-xs text-slate-500">{c.company_name}</p>
                          )}
                          <p className="text-xs text-slate-400 font-mono">{c.customer_code}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 hidden md:table-cell">
                      <div className="flex items-center gap-1.5 text-sm text-slate-600">
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                        {c.mobile_number}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 hidden lg:table-cell">
                      {(c.area || c.city) && (
                        <div className="flex items-center gap-1.5 text-sm text-slate-600">
                          <MapPin className="w-3.5 h-3.5 text-slate-400" />
                          {[c.area, c.city].filter(Boolean).join(', ')}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${typeColors[c.customer_type] ?? 'bg-slate-100 text-slate-700'}`}>
                        {c.customer_type.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 hidden sm:table-cell">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${getStatusColor(c.status)}`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <Link
                        href={`/customers/${c.id}`}
                        className="text-xs text-blue-600 hover:text-blue-700 font-medium opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        View →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
