import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { OpeningReceivablesForm } from './OpeningReceivablesForm'

export const metadata = { title: 'Opening Receivables' }

export default async function OpeningReceivablesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profileRaw } = await (supabase as any)
    .from('users').select('organization_id').eq('id', user!.id).single()
  const profile = profileRaw as { organization_id: string } | null

  const [customersRes, entriesRes] = await Promise.all([
    (supabase as any)
      .from('customers')
      .select('id, full_name, customer_code')
      .eq('organization_id', profile?.organization_id)
      .eq('is_active', true)
      .order('full_name'),
    (supabase as any)
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
          <Link href="/finance/outstanding" className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back
          </Link>
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
