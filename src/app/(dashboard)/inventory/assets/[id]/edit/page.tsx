import { createAdminClient, createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { BackButton } from '@/components/ui/BackButton'
import { redirect, notFound } from 'next/navigation'
import { canEditAssets } from '@/lib/assets'
import { fetchAllActiveAssetStaff, fetchAllActiveAssetSuppliers } from '@/lib/assets.server'
import { AssetForm, type AssetInitial } from '../../AssetForm'
import { resolveBack } from '@/lib/backNav'

export const metadata = { title: 'Edit Asset' }

export default async function EditAssetPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ return_to?: string }>
}) {
  const { return_to } = await searchParams
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

  const { id } = await params
  const detail = resolveBack(return_to, `/inventory/assets/${id}`, 'Asset')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any

  const [{ data: assetRaw }, supplierRows, staffRows] = await Promise.all([
    admin
      .from('assets')
      .select('id, updated_at, asset_name, category, serial_number, purchase_date, purchase_cost, payment_method, purchase_reference, supplier_id, assigned_staff_id, location, condition, status, warranty_expiry, service_due_date, depreciation_start_date, useful_life_months, salvage_value, disposal_date, disposal_method, disposal_proceeds, disposal_payment_method, disposal_reference, disposal_reason, notes')
      .eq('id', id)
      .eq('organization_id', profile.organization_id)
      .maybeSingle(),
    fetchAllActiveAssetSuppliers(admin, profile.organization_id),
    fetchAllActiveAssetStaff(admin, profile.organization_id),
  ])

  if (!assetRaw) notFound()

  const suppliers = supplierRows.map((supplier) => ({
    id: supplier.id,
    name: supplier.supplier_name,
  }))
  const staff = staffRows.map((employee) => ({
    id: employee.id,
    name: `${employee.full_name}${employee.staff_code ? ` (${employee.staff_code})` : ''}`,
  }))

  const asset = assetRaw as AssetInitial

  return (
    <div className="animate-fade-in">
      <Header
        title="Edit Asset"
        subtitle={asset.asset_name}
        actions={<BackButton href={detail.href} label="Cancel" />}
      />
      <div className="p-6">
        <AssetForm suppliers={suppliers} staff={staff} initial={asset} cancelHref={detail.href} returnTo={detail.href} />
      </div>
    </div>
  )
}
