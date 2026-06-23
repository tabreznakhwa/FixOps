import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { NewSupplierForm } from './NewSupplierForm'

export const metadata = { title: 'New Supplier' }

export default function NewSupplierPage() {
  return (
    <div className="animate-fade-in">
      <Header
        title="New Supplier"
        subtitle="Add a new supplier to your directory"
        actions={
          <Link
            href="/suppliers"
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </Link>
        }
      />
      <div className="p-6">
        <NewSupplierForm />
      </div>
    </div>
  )
}
