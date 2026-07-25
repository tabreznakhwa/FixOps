import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import { BackButton } from '@/components/ui/BackButton'
import { NewExpenseForm } from './NewExpenseForm'

export const metadata = { title: 'Add Expense' }

export default function NewExpensePage() {
  return (
    <div className="animate-fade-in">
      <Header
        title="Add Expense"
        subtitle="Record a new operational expense"
        actions={
          <BackButton fallbackHref="/finance/expenses" label="Back" />
        }
      />
      <div className="p-6">
        <NewExpenseForm />
      </div>
    </div>
  )
}
