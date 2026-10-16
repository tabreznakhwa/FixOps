import { createAdminClient, createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { BackButton } from '@/components/ui/BackButton'
import { redirect } from 'next/navigation'
import { canEditAssets } from '@/lib/assets'
import { fetchAllActiveAssetStaff, fetchAllActiveAssetSuppliers } from '@/lib/assets.server'
import { AssetForm } from '../AssetForm'
import { resolveBack } from '@/lib/backNav'

export const metadata = { title: 'Record Asset' }

export default async function NewAssetPage({
  searchParams,
}: {
  searchParams: Promise<{ return_to?: string }>
}) {
  const { return_to } = await searchParams
  const back = resolveBack(return_to, '/inventory/assets', 'Company Assets')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profileRaw } = await (supabase as any)
    .from('users')
    .select('organization_id, role, status')
    .eq('id', user.id)
    .single()

  const profile = profileRaw as { organization_id: string; role: string; status: string } | null
  if (!profile || profile.status !== 'active' || !profile.organization_id) redirect('/login')
  if (!canEditAssets(profile.role)) redirect('/dashboard?error=unauthorized')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any

  const [supplierRows, staffRows] = await Promise.all([
    fetchAllActiveAssetSuppliers(admin, profile.organization_id),
    fetchAllActiveAssetStaff(admin, profile.organization_id),
  ])

  const suppliers = supplierRows.map((supplier) => ({
    id: supplier.id,
    name: supplier.supplier_name,
  }))
  const staff = staffRows.map((employee) => ({
    id: employee.id,
    name: `${employee.full_name}${employee.staff_code ? ` (${employee.staff_code})` : ''}`,
  }))

  return (
    <div className="animate-fade-in">
      <Header
        title="Record Asset"
        subtitle="Add a fixed asset and its linked capital expense"
        actions={<BackButton href={back.href} label={back.label} />}
      />
      <div className="p-6">
        <AssetForm suppliers={suppliers} staff={staff} cancelHref={back.href} returnTo={back.href} />
      </div>
    </div>
  )
}
