import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { BackButton } from '@/components/ui/BackButton'
import { NewExpenseForm } from './NewExpenseForm'
import { resolveBack } from '@/lib/backNav'

export const metadata = { title: 'Add Expense' }

export default async function NewExpensePage({
  searchParams,
}: {
  searchParams: Promise<{ return_to?: string | string[] }>
}) {
  const back = resolveBack((await searchParams).return_to, '/finance/expenses', 'Expenses')
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
          <BackButton href={back.href} label={back.label} />
        }
      />
      <div className="p-6">
        <NewExpenseForm customCategories={customCategories} canManageCategories={canManageCategories} returnTo={back.href} />
      </div>
    </div>
  )
}
