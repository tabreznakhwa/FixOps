import { createAdminClient } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { BackButton } from '@/components/ui/BackButton'
import { EditExpenseForm } from './EditExpenseForm'
import { notFound, redirect } from 'next/navigation'
import { resolveBack, safeReturnTo, withReturnTo } from '@/lib/backNav'

export const metadata = { title: 'Edit Expense' }

export default async function EditExpensePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ return_to?: string | string[] }>
}) {
  const { id } = await params
  const { return_to } = await searchParams
  const back = resolveBack(return_to, '/finance/expenses', 'Expenses')
  const expenseDestination = safeReturnTo(return_to) ?? '/finance/expenses'

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profileRaw } = await (supabase as any).from('users').select('organization_id, role').eq('id', user!.id).single()
  const profile = profileRaw as { organization_id: string; role: string } | null

  if (!profile || !['owner', 'admin', 'hr', 'manager'].includes(profile.role)) notFound()
  const canManageCategories = ['owner', 'admin', 'manager'].includes(profile.role)

  const admin = createAdminClient() as any
  const [{ data: expense }, { data: customCategoriesRaw }] = await Promise.all([
    admin
      .from('expenses')
      .select('id, expense_number, expense_date, category, description, amount, payment_method, reference_number, notes, asset_id')
      .eq('id', id)
      .eq('organization_id', profile.organization_id)
      .single(),
    admin
      .from('expense_categories')
      .select('value, label')
      .eq('organization_id', profile.organization_id)
      .order('label'),
  ])
  const customCategories = (customCategoriesRaw ?? []) as { value: string; label: string }[]

  if (!expense) notFound()
  if (expense.asset_id) {
    if (['owner', 'admin', 'manager'].includes(profile.role)) {
      redirect(withReturnTo(`/inventory/assets/${expense.asset_id}`, expenseDestination))
    }
    const destinationUrl = new URL(expenseDestination, 'https://fixops.internal')
    destinationUrl.searchParams.set('error', 'linked_asset')
    redirect(`${destinationUrl.pathname}${destinationUrl.search}${destinationUrl.hash}`)
  }

  return (
    <div className="animate-fade-in">
      <Header
        title="Edit Expense"
        subtitle={expense.expense_number}
        actions={
          <BackButton href={back.href} label={back.label} />
        }
      />
      <div className="p-6">
        <EditExpenseForm id={id} initial={expense} customCategories={customCategories} canManageCategories={canManageCategories} returnTo={back.href} />
      </div>
    </div>
  )
}
