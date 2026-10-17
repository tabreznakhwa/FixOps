import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { getAuthedProfile } from '@/lib/auth/session'
import { getRoleAccess } from '@/lib/orgPermissions'
import { Header } from '@/components/layout/Header'
import { FileBarChart } from 'lucide-react'
import { OrgLetterhead } from '@/components/print/OrgLetterhead'
import { PrintActions } from '@/components/print/PrintActions'
import { SupplierSelector } from './SupplierSelector'
import { DateRangeFilter } from '@/components/ui/DateRangeFilter'
import { Suspense } from 'react'
import { buildVendorLedger } from '../vendor-outstanding/vendorLedger'
import { VendorLedgerTable } from '../vendor-outstanding/VendorLedgerTable'

export const metadata = { title: 'Vendor Ledger' }

export default async function VendorLedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ supplier_id?: string; from_date?: string; to_date?: string }>
}) {
  const params = await searchParams
  const { profile } = await getAuthedProfile()
  if (!profile || profile.status !== 'active' || !profile.organization_id) redirect('/login')
  const financeAccess = await getRoleAccess(profile.organization_id, profile.role)
  if (financeAccess.finance === 'none') redirect('/dashboard?error=unauthorized')

  const orgId = profile.organization_id
  // Accounting posting metadata trails the hand-maintained Database type.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any

  const { data: suppliersRaw } = await admin
    .from('suppliers')
    .select('id, supplier_name, supplier_code')
    .eq('organization_id', orgId)
    .eq('status', 'active')
    .order('supplier_name')

  const suppliers = (suppliersRaw ?? []) as Array<{ id: string; supplier_name: string; supplier_code: string }>
  const selectedSupplier = params.supplier_id
    ? suppliers.find((s) => s.id === params.supplier_id) ?? null
    : null

  // This page is now a thin shell over the canonical vendor-outstanding builder:
  // one accounting truth, one sign convention (AP: purchases = Cr, payments = Dr),
  // one stable ordering and paging strategy.
  const ledger = selectedSupplier
    ? await buildVendorLedger(admin, orgId, {
        supplierId: selectedSupplier.id,
        from: params.from_date,
        to: params.to_date,
      })
    : null

  return (
    <div className="animate-fade-in">
      <div className="hidden print:block px-8 pt-8">
        <OrgLetterhead title="Vendor Ledger" subtitle="Supplier Account Statement" />
      </div>
      <Header title="Vendor Ledger" subtitle="Supplier account statement & transaction history"
        actions={<PrintActions />} />

      <div className="p-6 space-y-5">
        <div className="print:hidden">
          <Suspense>
            <DateRangeFilter
              basePath="/suppliers/vendor-ledger"
              from={params.from_date}
              to={params.to_date}
              fromKey="from_date"
              toKey="to_date"
            />
          </Suspense>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <Suspense>
            <SupplierSelector
              suppliers={suppliers}
              selectedId={params.supplier_id ?? ''}
            />
          </Suspense>
        </div>

        {selectedSupplier && ledger && (
          <VendorLedgerTable
            ledger={ledger}
            showSupplier={false}
            supplierName={selectedSupplier.supplier_name}
          />
        )}

        {!params.supplier_id && (
          <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
            <FileBarChart className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">Select a supplier to view their ledger</p>
            <p className="text-slate-400 text-sm mt-1">Shows opening payables, purchase invoices, payments and advances with a running balance.</p>
          </div>
        )}
      </div>
    </div>
  )
}
