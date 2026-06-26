'use client'

import { useActionState } from 'react'
import { updateSupplier } from '../../actions'
import Link from 'next/link'
import { Loader2, AlertCircle } from 'lucide-react'

const inputCls = 'w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500'
const labelCls = 'block text-sm font-medium text-slate-700 mb-1.5'

interface Supplier {
  id: string; supplier_name: string; contact_person: string | null;
  mobile_number: string | null; email: string | null; city: string | null;
  address: string | null; payment_terms: number; notes: string | null; status: string;
}

export function EditSupplierForm({ supplier }: { supplier: Supplier }) {
  const [state, action, pending] = useActionState(updateSupplier, null)

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="id" value={supplier.id} />

      {state?.error && (
        <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {state.error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-700">Supplier Information</h2>
        <div>
          <label className={labelCls}>Supplier Name <span className="text-red-500">*</span></label>
          <input type="text" name="supplier_name" required defaultValue={supplier.supplier_name} className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Contact Person</label>
            <input type="text" name="contact_person" defaultValue={supplier.contact_person ?? ''} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Mobile Number</label>
            <input type="tel" name="mobile_number" defaultValue={supplier.mobile_number ?? ''} className={inputCls} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Email</label>
            <input type="email" name="email" defaultValue={supplier.email ?? ''} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>City</label>
            <input type="text" name="city" defaultValue={supplier.city ?? ''} className={inputCls} />
          </div>
        </div>
        <div>
          <label className={labelCls}>Address</label>
          <textarea name="address" rows={2} defaultValue={supplier.address ?? ''} className={inputCls + ' resize-none'} />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-700">Terms</h2>
        <div>
          <label className={labelCls}>Payment Terms</label>
          <select name="payment_terms" defaultValue={String(supplier.payment_terms)} className={inputCls}>
            <option value="0">Due on Receipt</option>
            <option value="7">Net 7</option>
            <option value="14">Net 14</option>
            <option value="30">Net 30</option>
            <option value="60">Net 60</option>
            <option value="90">Net 90</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Notes</label>
          <textarea name="notes" rows={3} defaultValue={supplier.notes ?? ''} className={inputCls + ' resize-none'} />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Status</h2>
        <select name="status" defaultValue={supplier.status}
          className="px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      <div className="flex items-center gap-3 pb-6">
        <button type="submit" disabled={pending}
          className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors">
          {pending ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : 'Save Changes'}
        </button>
        <Link href={`/suppliers/${supplier.id}`}
          className="px-6 py-2.5 text-sm font-semibold text-slate-600 hover:text-slate-800 transition-colors">
          Cancel
        </Link>
      </div>
    </form>
  )
}
