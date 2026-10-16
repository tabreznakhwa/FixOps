import { createClient, createAdminClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import { BackButton } from '@/components/ui/BackButton'
import { OpeningPayablesForm } from './OpeningPayablesForm'
import { resolveBack } from '@/lib/backNav'

export const metadata = { title: 'Opening Payables' }

export default async function OpeningPayablesPage({
  searchParams,
}: {
  searchParams: Promise<{ return_to?: string }>
}) {
  const { return_to } = await searchParams
  const back = resolveBack(return_to, '/suppliers', 'Suppliers')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profileRaw } = await (supabase as any)
    .from('users').select('organization_id').eq('id', user!.id).single()
  const profile = profileRaw as { organization_id: string } | null

  const admin = createAdminClient() as any

  const [suppliersRes, entriesRes] = await Promise.all([
    admin
      .from('suppliers')
      .select('id, supplier_name, supplier_code')
      .eq('organization_id', profile?.organization_id)
      .eq('status', 'active')
      .order('supplier_name'),
    admin
      .from('opening_payables')
      .select('*, suppliers(supplier_name, supplier_code)')
      .eq('organization_id', profile?.organization_id)
      .order('bill_date', { ascending: true }),
  ])

  return (
    <div className="animate-fade-in">
      <Header
        title="Opening Payables"
        subtitle="Supplier bills outstanding before go-live"
        actions={
          <BackButton href={back.href} label={back.label} />
        }
      />
      <div className="p-6">
        <div className="mb-4 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-700">
          Enter supplier invoices or bills you owed <strong>before your go-live date</strong>. These will appear as outstanding supplier payables.
        </div>
        <OpeningPayablesForm
          suppliers={suppliersRes.data ?? []}
          entries={entriesRes.data ?? []}
        />
      </div>
    </div>
  )
}
