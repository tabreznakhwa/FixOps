import { createClient, createAdminClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { CompanySettingsForm } from './CompanySettingsForm'

export const metadata = { title: 'Company Settings' }

export default async function CompanySettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profileRaw } = await (supabase as any)
    .from('users').select('organization_id').eq('id', user!.id).single()
  const profile = profileRaw as { organization_id: string } | null

  const admin = createAdminClient() as any
  const { data: orgRaw } = profile?.organization_id
    ? await admin.from('organizations')
        .select('name, email, phone, address, city, country, currency, vat_number, vat_rate, logo_url, bank_name, bank_account_number, bank_iban, bank_swift, opening_cash_balance, opening_bank_balance, opening_balance_date')
        .eq('id', profile.organization_id)
        .single()
    : { data: null }

  const org = orgRaw ?? {
    name: '', email: null, phone: null, address: null, city: null, country: 'Kuwait',
    currency: 'KWD', vat_number: null, vat_rate: null, logo_url: null,
    bank_name: null, bank_account_number: null, bank_iban: null, bank_swift: null,
    opening_cash_balance: 0, opening_bank_balance: 0, opening_balance_date: null,
  }

  return (
    <div className="animate-fade-in">
      <Header
        title="Company Settings"
        subtitle="Logo, contact details, bank account, and tax settings"
        actions={
          <Link href="/settings" className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to Settings
          </Link>
        }
      />
      <div className="p-6 max-w-3xl">
        <CompanySettingsForm org={org} />
      </div>
    </div>
  )
}
