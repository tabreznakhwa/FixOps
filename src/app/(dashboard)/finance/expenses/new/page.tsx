import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { BackButton } from '@/components/ui/BackButton'
import { NewExpenseForm } from './NewExpenseForm'

export const metadata = { title: 'Add Expense' }

export default async function NewExpensePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profileRaw } = await (supabase as any).from('users').select('role').eq('id', user!.id).single()
  const role = (profileRaw as { role: string } | null)?.role ?? ''
  const canManageCategories = ['owner', 'admin', 'manager'].includes(role)

  const { data: customCategoriesRaw } = await (supabase as any)
    .from('expense_categories')
    .select('value, label')
    .order('label')
  const customCategories = (customCategoriesRaw ?? []) as { value: string; label: string }[]

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
        <NewExpenseForm customCategories={customCategories} canManageCategories={canManageCategories} />
      </div>
    </div>
  )
}
