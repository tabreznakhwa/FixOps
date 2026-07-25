import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import { BackButton } from '@/components/ui/BackButton'
import { OpeningReceivablesForm } from './OpeningReceivablesForm'

export const metadata = { title: 'Opening Receivables' }

export default async function OpeningReceivablesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profileRaw } = await (supabase as any)
    .from('users').select('organization_id').eq('id', user!.id).single()
  const profile = profileRaw as { organization_id: string } | null

  const admin = createAdminClient() as any

  const [customersRes, entriesRes] = await Promise.all([
    admin
      .from('customers')
      .select('id, full_name, customer_code, mobile_number')
      .eq('organization_id', profile?.organization_id)
      .eq('status', 'active')
      .order('full_name')
      .limit(5000),
    admin
      .from('opening_receivables')
      .select('*, customers(full_name, customer_code)')
      .eq('organization_id', profile?.organization_id)
      .order('invoice_date', { ascending: true }),
  ])

  return (
    <div className="animate-fade-in">
      <Header
        title="Opening Receivables"
        subtitle="Customer bills outstanding before go-live"
        actions={
          <BackButton fallbackHref="/finance/outstanding" label="Back" />
        }
      />
      <div className="p-6">
        <div className="mb-4 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-700">
          Enter invoices or bills that customers owed you <strong>before your go-live date</strong>. These will appear as outstanding in Receivables and Bill-wise Outstanding.
        </div>
        <OpeningReceivablesForm
          customers={customersRes.data ?? []}
          entries={entriesRes.data ?? []}
        />
      </div>
    </div>
  )
}
