import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { NewExpenseForm } from './NewExpenseForm'

export const metadata = { title: 'Add Expense' }

export default function NewExpensePage() {
  return (
    <div className="animate-fade-in">
      <Header
        title="Add Expense"
        subtitle="Record a new operational expense"
        actions={
          <Link
            href="/finance/expenses"
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </Link>
        }
      />
      <div className="p-6">
        <NewExpenseForm />
      </div>
    </div>
  )
}
