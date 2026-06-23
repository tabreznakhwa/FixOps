import { createClient } from '@/lib/supabase/server'


interface Props {
  title: string
  subtitle?: string
  showBankDetails?: boolean
}

export async function OrgLetterhead({ title, subtitle, showBankDetails = false }: Props) {
  const supabase = await createClient()
  const { data: orgRaw } = await (supabase as any)
    .from('organizations')
    .select('name, logo_url, address, city, phone, email, vat_number, bank_name, bank_account_number, bank_iban, bank_swift')
    .limit(1)
    .single()

  const org = orgRaw as {
    name: string; logo_url: string | null; address: string | null; city: string | null
    phone: string | null; email: string | null; vat_number: string | null
    bank_name: string | null; bank_account_number: string | null; bank_iban: string | null; bank_swift: string | null
  } | null

  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

  return (
    <div className="hidden print:block mb-6">
      <div className="flex items-start justify-between pb-5 border-b-2 border-slate-800">
        {/* Left: logo + company info */}
        <div className="flex items-start gap-4">
          {org?.logo_url ? (
            <img src={org.logo_url} alt={org.name} className="h-16 w-auto object-contain" />
          ) : (
            <div className="w-14 h-14 bg-blue-600 rounded-xl flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
              {org?.name?.slice(0, 2).toUpperCase() ?? 'FO'}
            </div>
          )}
          <div>
            <h1 className="text-xl font-bold text-slate-900">{org?.name ?? 'Company'}</h1>
            {org?.address && <p className="text-sm text-slate-600 mt-0.5">{org.address}{org.city ? `, ${org.city}` : ''}</p>}
            <div className="flex flex-wrap gap-x-4 mt-0.5 text-sm text-slate-600">
              {org?.phone && <span>Tel: {org.phone}</span>}
              {org?.email && <span>Email: {org.email}</span>}
              {org?.vat_number && <span className="font-semibold">TRN: {org.vat_number}</span>}
            </div>
          </div>
        </div>

        {/* Right: report title + date */}
        <div className="text-right">
          <h2 className="text-2xl font-bold text-slate-900">{title}</h2>
          {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
          <p className="text-xs text-slate-400 mt-1">Printed: {today}</p>
        </div>
      </div>
      {showBankDetails && (org?.bank_name || org?.bank_iban) && (
        <div className="mt-3 pt-3 border-t border-slate-200 flex flex-wrap gap-x-6 text-xs text-slate-600">
          {org?.bank_name && <span><strong>Bank:</strong> {org.bank_name}</span>}
          {org?.bank_account_number && <span><strong>A/C:</strong> {org.bank_account_number}</span>}
          {org?.bank_iban && <span><strong>IBAN:</strong> {org.bank_iban}</span>}
          {org?.bank_swift && <span><strong>SWIFT:</strong> {org.bank_swift}</span>}
        </div>
      )}
    </div>
  )
}
