import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Phone, MessageCircle, Mail, MapPin, Edit, Plus, Building2, User, Printer } from 'lucide-react'
import { formatDate, getStatusColor, getPriorityColor, formatStatus } from '@/lib/utils'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  return { title: 'Customer Detail' }
}

const typeColors: Record<string, string> = {
  individual: 'bg-blue-100 text-blue-700',
  company: 'bg-purple-100 text-purple-700',
  amc: 'bg-green-100 text-green-700',
  one_time: 'bg-slate-100 text-slate-700',
  credit: 'bg-amber-100 text-amber-700',
}

const categoryIcons: Record<string, string> = {
  ac_maintenance: '❄️', plumbing: '🔧', electrical: '⚡',
  general: '🔨', emergency: '🚨', installation: '🏗️',
  inspection: '🔍', quotation: '📝',
}

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: customerRaw } = await (supabase as any)
    .from('customers')
    .select('*')
    .eq('id', id)
    .single()

  if (!customerRaw) notFound()

  const customer = customerRaw as {
    id: string; customer_code: string; full_name: string; print_name: string | null; company_name: string | null;
    contact_person: string | null; customer_type: string; mobile_number: string;
    whatsapp_number: string | null; email: string | null; address: string | null;
    block: string | null; street: string | null; avenue: string | null; house_number: string | null;
    area: string | null; city: string | null; payment_terms: number; credit_limit: number;
    advance_balance: number; notes: string | null; status: string; created_at: string;
  }

  const { data: complaintsRaw } = await (supabase as any)
    .from('complaints')
    .select('id, complaint_number, description, priority, status, service_category, created_at')
    .eq('customer_id', id)
    .order('created_at', { ascending: false })
    .limit(20)

  const complaints = (complaintsRaw ?? []) as Array<{
    id: string; complaint_number: string; description: string;
    priority: string; status: string; service_category: string | string[]; created_at: string;
  }>

  return (
    <div className="animate-fade-in">
      <Header
        title={customer.full_name}
        subtitle={customer.customer_code}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/customers"
              className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </Link>
            <Link
              href={`/customers/${customer.id}/edit`}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition-colors"
            >
              <Edit className="w-4 h-4" /> Edit
            </Link>
            <Link
              href={`/complaints/new?customer_id=${customer.id}`}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition-colors"
            >
              <Plus className="w-4 h-4" /> Add Complaint
            </Link>
          </div>
        }
      />

      <div className="p-6 space-y-5 max-w-4xl">
        {/* Profile card */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center text-white text-lg font-bold flex-shrink-0">
              {customer.full_name.slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-slate-900">{customer.full_name}</h2>
                <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full capitalize ${typeColors[customer.customer_type] ?? 'bg-slate-100 text-slate-700'}`}>
                  {customer.customer_type.replace('_', ' ')}
                </span>
                <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${getStatusColor(customer.status)}`}>
                  {customer.status}
                </span>
              </div>
              {customer.company_name && (
                <p className="text-sm text-slate-500 mt-0.5 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5" /> {customer.company_name}
                </p>
              )}
              {customer.contact_person && (
                <p className="text-sm text-slate-500 mt-0.5 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5" /> {customer.contact_person}
                </p>
              )}
              <p className="text-xs text-slate-400 font-mono mt-1">Customer since {formatDate(customer.created_at)}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Contact */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Contact</h3>
            <div className="space-y-2.5">
              <div className="flex items-center gap-2.5 text-sm text-slate-700">
                <Phone className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <a href={`tel:${customer.mobile_number}`} className="hover:text-blue-600 transition-colors">
                  {customer.mobile_number}
                </a>
              </div>
              {customer.print_name && (
                <div className="flex items-center gap-2.5 text-sm text-slate-700">
                  <Printer className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <span className="text-slate-600">
                    Prints as: <span className="font-semibold text-slate-800">{customer.print_name}</span>
                  </span>
                </div>
              )}
              {customer.whatsapp_number && (
                <div className="flex items-center gap-2.5 text-sm text-slate-700">
                  <MessageCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                  <a href={`https://wa.me/${customer.whatsapp_number.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="hover:text-green-600 transition-colors">
                    {customer.whatsapp_number}
                  </a>
                </div>
              )}
              {customer.email && (
                <div className="flex items-center gap-2.5 text-sm text-slate-700">
                  <Mail className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <a href={`mailto:${customer.email}`} className="hover:text-blue-600 transition-colors">
                    {customer.email}
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Address */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Address</h3>
            {(customer.address || customer.block || customer.street || customer.avenue || customer.house_number || customer.area || customer.city) ? (
              <div className="flex items-start gap-2.5 text-sm text-slate-700">
                <MapPin className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  {customer.address && <p>{customer.address}</p>}
                  <div className="flex flex-wrap gap-x-3 text-slate-600">
                    {customer.block && <span>Block {customer.block}</span>}
                    {customer.street && <span>Street {customer.street}</span>}
                    {customer.avenue && <span>Ave {customer.avenue}</span>}
                    {customer.house_number && <span>House {customer.house_number}</span>}
                  </div>
                  {(customer.area || customer.city) && (
                    <p className="text-slate-500">{[customer.area, customer.city].filter(Boolean).join(', ')}</p>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-400">No address on file</p>
            )}
          </div>
        </div>

        {/* Credit terms — only show if credit type or values set */}
        {(customer.customer_type === 'credit' || customer.credit_limit > 0 || customer.advance_balance > 0) && (
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Account & Finance</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-slate-400">Payment Terms</p>
                <p className="text-sm font-semibold text-slate-800 mt-0.5">{customer.payment_terms} days</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Credit Limit</p>
                <p className="text-sm font-semibold text-slate-800 mt-0.5">KWD {customer.credit_limit.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Advance Balance</p>
                <p className={`text-sm font-semibold mt-0.5 ${customer.advance_balance > 0 ? 'text-green-600' : 'text-slate-800'}`}>
                  KWD {customer.advance_balance.toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Notes */}
        {customer.notes && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-amber-800 mb-1.5">Notes</h3>
            <p className="text-sm text-amber-700 whitespace-pre-wrap">{customer.notes}</p>
          </div>
        )}

        {/* Complaints history */}
        <div className="bg-white rounded-xl border border-slate-200">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-700">
              Complaint History
              {complaints.length > 0 && (
                <span className="ml-2 text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{complaints.length}</span>
              )}
            </h3>
            <Link
              href={`/complaints/new?customer_id=${customer.id}`}
              className="flex items-center gap-1.5 text-xs text-blue-600 font-semibold hover:text-blue-700 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> New Complaint
            </Link>
          </div>

          {complaints.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-slate-400">No complaints yet</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {complaints.map((c) => {
                const cats = Array.isArray(c.service_category) ? c.service_category : [c.service_category]
                return (
                  <Link
                    key={c.id}
                    href={`/complaints/${c.id}`}
                    className="flex items-start gap-3 px-5 py-3.5 hover:bg-slate-50 transition-colors group"
                  >
                    <span className="text-xl flex-shrink-0 mt-0.5">{categoryIcons[cats[0]] ?? '🔧'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className="text-xs font-mono text-slate-400">{c.complaint_number}</span>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${getPriorityColor(c.priority)}`}>
                          {c.priority}
                        </span>
                        <span className="text-xs text-slate-400 capitalize">{cats.map(s => s.replace(/_/g, ' ')).join(' · ')}</span>
                      </div>
                      <p className="text-sm text-slate-700 line-clamp-1 group-hover:text-blue-700 transition-colors">{c.description}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{formatDate(c.created_at)}</p>
                    </div>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0 ${getStatusColor(c.status)}`}>
                      {formatStatus(c.status)}
                    </span>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
