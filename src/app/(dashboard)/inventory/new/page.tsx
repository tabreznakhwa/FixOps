import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { NewInventoryItemForm } from './NewInventoryItemForm'

export const metadata = { title: 'Add Inventory Item' }

export default function NewInventoryItemPage() {
  return (
    <div className="animate-fade-in">
      <Header
        title="Add Inventory Item"
        subtitle="Add a new part or material to inventory"
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
        <NewInventoryItemForm />
      </div>
    </div>
  )
}
