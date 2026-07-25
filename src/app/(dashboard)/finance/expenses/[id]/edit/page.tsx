import { createAdminClient } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import { BackButton } from '@/components/ui/BackButton'
import { EditExpenseForm } from './EditExpenseForm'
import { notFound } from 'next/navigation'

export const metadata = { title: 'Edit Expense' }

export default async function EditExpensePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profileRaw } = await (supabase as any).from('users').select('organization_id, role').eq('id', user!.id).single()
  const profile = profileRaw as { organization_id: string; role: string } | null

  if (!profile || !['owner', 'admin', 'hr', 'manager'].includes(profile.role)) notFound()

  const admin = createAdminClient() as any
  const { data: expense } = await admin
    .from('expenses')
    .select('id, expense_number, expense_date, category, description, amount, payment_method, reference_number, notes')
    .eq('id', id)
    .eq('organization_id', profile.organization_id)
    .single()

  if (!expense) notFound()

  return (
    <div className="animate-fade-in">
      <Header
        title="Edit Expense"
        subtitle={expense.expense_number}
        actions={
          <BackButton fallbackHref="/finance/expenses" label="Back to Expenses" />
        }
      />
      <div className="p-6">
        <EditExpenseForm id={id} initial={expense} />
      </div>
    </div>
  )
}
