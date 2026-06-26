'use client'

import { useActionState, useState } from 'react'
import { updateCustomer } from '../../actions'
import Link from 'next/link'
import { Loader2, AlertCircle } from 'lucide-react'

const CUSTOMER_TYPES = [
  { value: 'individual', label: 'Individual' },
  { value: 'company', label: 'Company' },
  { value: 'amc', label: 'AMC Customer' },
  { value: 'one_time', label: 'One-Time' },
  { value: 'credit', label: 'Credit Account' },
]

const inputCls = 'w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500'
const labelCls = 'block text-sm font-medium text-slate-700 mb-1.5'

interface Customer {
  id: string; customer_type: string; full_name: string; company_name: string | null;
  contact_person: string | null; mobile_number: string; whatsapp_number: string | null;
  email: string | null; address: string | null; block: string | null; street: string | null;
  avenue: string | null; house_number: string | null; area: string | null; city: string | null;
  payment_terms: number; credit_limit: number; notes: string | null; status: string;
}

export function EditCustomerForm({ customer }: { customer: Customer }) {
  const [state, action, pending] = useActionState(updateCustomer, null)
  const [customerType, setCustomerType] = useState(customer.customer_type)

  const isCompanyType = customerType === 'company' || customerType === 'amc'
  const isCreditType = customerType === 'credit'

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="id" value={customer.id} />

      {state?.error && (
        <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {state.error}
        </div>
      )}

      {/* Customer Type */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">Customer Type</h2>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {CUSTOMER_TYPES.map((t) => (
            <label key={t.value} className="cursor-pointer">
              <input
                type="radio"
                name="customer_type"
                value={t.value}
                checked={customerType === t.value}
                onChange={() => setCustomerType(t.value)}
                className="sr-only"
              />
              <div className={`text-center px-3 py-2 rounded-lg border-2 text-xs font-semibold transition-all ${
                customerType === t.value
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'border-slate-200 text-slate-600 hover:border-blue-200'
              }`}>
                {t.label}
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Contact Information */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-700">Contact Information</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className={isCompanyType ? '' : 'sm:col-span-2'}>
            <label className={labelCls}>Full Name <span className="text-red-500">*</span></label>
            <input type="text" name="full_name" required defaultValue={customer.full_name} className={inputCls} />
          </div>
          {isCompanyType && (
            <div>
              <label className={labelCls}>Company Name</label>
              <input type="text" name="company_name" defaultValue={customer.company_name ?? ''} className={inputCls} />
            </div>
          )}
        </div>

        {isCompanyType && (
          <div>
            <label className={labelCls}>Contact Person</label>
            <input type="text" name="contact_person" defaultValue={customer.contact_person ?? ''} className={inputCls} />
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Mobile Number <span className="text-red-500">*</span></label>
            <input type="tel" name="mobile_number" required defaultValue={customer.mobile_number} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>WhatsApp Number</label>
            <input type="tel" name="whatsapp_number" defaultValue={customer.whatsapp_number ?? ''} className={inputCls} />
          </div>
        </div>

        <div>
          <label className={labelCls}>Email</label>
          <input type="email" name="email" defaultValue={customer.email ?? ''} className={inputCls} />
        </div>
      </div>

      {/* Address */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-700">Address</h2>
        <div>
          <label className={labelCls}>Address</label>
          <input type="text" name="address" defaultValue={customer.address ?? ''} className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Block</label>
            <input type="text" name="block" defaultValue={customer.block ?? ''} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Street</label>
            <input type="text" name="street" defaultValue={customer.street ?? ''} className={inputCls} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Avenue</label>
            <input type="text" name="avenue" defaultValue={customer.avenue ?? ''} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>House / Building No.</label>
            <input type="text" name="house_number" defaultValue={customer.house_number ?? ''} className={inputCls} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Area</label>
            <input type="text" name="area" defaultValue={customer.area ?? ''} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>City</label>
            <input type="text" name="city" defaultValue={customer.city ?? ''} className={inputCls} />
          </div>
        </div>
      </div>

      {/* Credit Terms */}
      {isCreditType && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-700">Credit Terms</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Payment Terms (days)</label>
              <input type="number" name="payment_terms" defaultValue={customer.payment_terms} min={0} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Credit Limit (KWD)</label>
              <input type="number" name="credit_limit" defaultValue={customer.credit_limit} min={0} step={0.01} className={inputCls} />
            </div>
          </div>
        </div>
      )}

      {/* Status */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Status</h2>
        <select name="status" defaultValue={customer.status}
          className="px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="blocked">Blocked</option>
        </select>
      </div>

      {/* Notes */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <label className={labelCls}>Notes</label>
        <textarea name="notes" rows={3} defaultValue={customer.notes ?? ''}
          className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
      </div>

      <div className="flex items-center gap-3 pb-6">
        <button type="submit" disabled={pending}
          className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors">
          {pending ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : 'Save Changes'}
        </button>
        <Link href={`/customers/${customer.id}`}
          className="px-6 py-2.5 text-sm font-semibold text-slate-600 hover:text-slate-800 transition-colors">
          Cancel
        </Link>
      </div>
    </form>
  )
}
