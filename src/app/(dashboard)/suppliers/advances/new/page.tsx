import { createAdminClient, createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { BackButton } from '@/components/ui/BackButton'
import { NewSupplierAdvanceForm } from './NewSupplierAdvanceForm'
import { resolveBack } from '@/lib/backNav'
import { redirect } from 'next/navigation'

export const metadata = { title: 'New Supplier Advance' }

export default async function NewSupplierAdvancePage({
  searchParams,
}: {
  searchParams: Promise<{ supplier_id?: string; return_to?: string }>
}) {
  const { supplier_id, return_to } = await searchParams
  const back = resolveBack(return_to, '/suppliers/advances', 'Supplier Advances')
  const supabase = await createClient()
  const admin = createAdminClient() as any

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profileRaw } = await (supabase as any)
    .from('users')
    .select('organization_id, role')
    .eq('id', user.id)
    .single()
  const profile = profileRaw as { organization_id: string; role: string } | null
  if (!profile || !['owner', 'admin', 'manager'].includes(profile.role)) {
    redirect('/suppliers/advances')
  }

  const { data: suppliersRaw } = await admin
    .from('suppliers')
    .select('id, supplier_name, supplier_code')
    .eq('organization_id', profile.organization_id)
    .eq('status', 'active')
    .order('supplier_name')

  const suppliers = (suppliersRaw ?? []) as Array<{
    id: string; supplier_name: string; supplier_code: string
  }>

  return (
    <div className="animate-fade-in">
      <Header
        title="New Supplier Advance"
        subtitle="Record an advance payment to a supplier"
        actions={
          <BackButton href={back.href} label={back.label} />
        }
      />
      <div className="p-6 max-w-xl">
        <NewSupplierAdvanceForm
          suppliers={suppliers}
          defaultSupplierId={supplier_id}
          returnTo={back.href}
        />
      </div>
    </div>
  )
}
