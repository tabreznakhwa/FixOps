import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import {
  ASSET_CATEGORIES,
  ASSET_CONDITIONS,
  ASSET_STATUSES,
  ASSET_PAYMENT_METHODS,
  canEditAssets,
  isValidISODate,
  isValidMoney,
} from '@/lib/assets'

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/

interface Actor {
  userId: string
  organization_id: string
  full_name: string
  role: string
}

async function getActor(): Promise<Actor | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any
  const { data } = await admin
    .from('users')
    .select('organization_id, full_name, role, status')
    .eq('id', user.id)
    .single()

  if (!data || data.status !== 'active' || !data.organization_id) return null
  return { ...data, userId: user.id }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await getActor()
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!canEditAssets(actor.role)) {
      return NextResponse.json({ error: 'Only an owner or admin can record assets' }, { status: 403 })
    }

    const body = await request.json()

    const assetId = String(body.asset_id ?? '').trim()
    const assetName = String(body.asset_name ?? '').trim()
    const category = String(body.category ?? '').trim()
    const purchaseDate = String(body.purchase_date ?? '').trim()
    const purchaseCost = body.purchase_cost
    const paymentMethod = String(body.payment_method ?? '').trim()
    const usefulLifeMonths = body.useful_life_months
    const depreciationStartDate = String(body.depreciation_start_date ?? '').trim()
    const salvageValue = body.salvage_value ?? '0'

    const serialNumber = String(body.serial_number ?? '').trim() || null
    const supplierId = body.supplier_id ? String(body.supplier_id) : null
    const purchaseReference = String(body.purchase_reference ?? '').trim() || null
    const location = String(body.location ?? '').trim() || null
    const assignedStaffId = body.assigned_staff_id ? String(body.assigned_staff_id) : null
    const warrantyExpiry = body.warranty_expiry ? String(body.warranty_expiry) : null
    const serviceDueDate = body.service_due_date ? String(body.service_due_date) : null
    const condition = String(body.condition ?? 'good').trim()
    const status = String(body.status ?? 'available').trim()
    const notes = String(body.notes ?? '').trim() || null

    if (!UUID_RE.test(assetId)) {
      return NextResponse.json({ error: 'Invalid asset request' }, { status: 400 })
    }
    if (!assetName) {
      return NextResponse.json({ error: 'Asset name is required' }, { status: 400 })
    }
    if (!ASSET_CATEGORIES.includes(category as (typeof ASSET_CATEGORIES)[number])) {
      return NextResponse.json({ error: 'Select a valid asset category' }, { status: 400 })
    }
    if (!purchaseDate || !isValidISODate(purchaseDate)) {
      return NextResponse.json({ error: 'Purchase date is required' }, { status: 400 })
    }
    if (!isValidMoney(purchaseCost)) {
      return NextResponse.json({ error: 'Purchase cost must be greater than zero with at most 3 decimal places' }, { status: 400 })
    }
    if (Number(purchaseCost) <= 0) {
      return NextResponse.json({ error: 'Purchase cost must be greater than zero with at most 3 decimal places' }, { status: 400 })
    }
    if (!ASSET_PAYMENT_METHODS.includes(paymentMethod as (typeof ASSET_PAYMENT_METHODS)[number])) {
      return NextResponse.json({ error: 'Select a valid payment method' }, { status: 400 })
    }
    if (!Number.isInteger(Number(usefulLifeMonths)) || !(Number(usefulLifeMonths) >= 1 && Number(usefulLifeMonths) <= 1200)) {
      return NextResponse.json({ error: 'Useful life must be between 1 and 1,200 months' }, { status: 400 })
    }
    if (!depreciationStartDate || !isValidISODate(depreciationStartDate)) {
      return NextResponse.json({ error: 'Depreciation start date is required' }, { status: 400 })
    }
    if (!isValidMoney(salvageValue) || Number(salvageValue) < 0 || Number(salvageValue) > Number(purchaseCost)) {
      return NextResponse.json({ error: 'Salvage value must be between 0 and the purchase cost' }, { status: 400 })
    }
    if (!ASSET_CONDITIONS.includes(condition as (typeof ASSET_CONDITIONS)[number])) {
      return NextResponse.json({ error: 'Select a valid condition' }, { status: 400 })
    }
    if (!ASSET_STATUSES.includes(status as (typeof ASSET_STATUSES)[number]) || status === 'disposed') {
      return NextResponse.json({ error: 'New assets cannot be created as disposed' }, { status: 400 })
    }
    for (const [value, id] of [[supplierId, 'supplier'], [assignedStaffId, 'custodian']] as const) {
      if (value && !UUID_RE.test(value)) {
        return NextResponse.json({ error: `Invalid ${id} selected` }, { status: 400 })
      }
    }
    for (const [value, label] of [[warrantyExpiry, 'Warranty expiry'], [serviceDueDate, 'Service due date']] as const) {
      if (value && !isValidISODate(value)) {
        return NextResponse.json({ error: `Enter a valid ${label.toLowerCase()} date` }, { status: 400 })
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any
    const { data: rows, error } = await admin.rpc('create_asset_with_expense', {
      p_org_id: actor.organization_id,
      p_actor_id: actor.userId,
      p_asset_id: assetId,
      p_asset_name: assetName,
      p_category: category,
      p_purchase_date: purchaseDate,
      p_purchase_cost: Number(purchaseCost),
      p_payment_method: paymentMethod,
      p_useful_life_months: Number(usefulLifeMonths),
      p_depreciation_start_date: depreciationStartDate,
      p_salvage_value: Number(salvageValue),
      p_serial_number: serialNumber,
      p_supplier_id: supplierId,
      p_purchase_reference: purchaseReference,
      p_location: location,
      p_assigned_staff_id: assignedStaffId,
      p_warranty_expiry: warrantyExpiry,
      p_service_due_date: serviceDueDate,
      p_condition: condition,
      p_status: status,
      p_notes: notes,
    })

    if (error) {
      const rawMessage = error.message?.replace(/^Error:\s*/, '') ?? ''
      const knownMessage = [
        'Only an owner or admin can record assets',
        'Asset name is required and must be 200 characters or fewer',
        'Select a valid asset category',
        'Purchase date is required',
        'Purchase date cannot be in the future',
        'Purchase cost must be greater than zero with at most 3 decimal places',
        'Select a valid payment method',
        'Useful life must be between 1 and 1,200 months',
        'Depreciation start date is required',
        'Depreciation cannot start before the purchase date',
        'Salvage value must be between 0 and the purchase cost',
        'Serial number must be 100 characters or fewer',
        'Reference must be 100 characters or fewer',
        'Location must be 255 characters or fewer',
        'Notes must be 2,000 characters or fewer',
        'Select a valid condition',
        'New assets cannot be created as disposed',
        'Warranty expiry cannot be before the purchase date',
        'Service due date cannot be before the purchase date',
        'An assigned asset must have a custodian',
        'Supplier does not belong to this organization',
        'Custodian must be an active employee in this organization',
        'This asset request conflicts with an existing asset record',
      ].find((message) => rawMessage.includes(message))

      if (error.code === '23505') {
        return NextResponse.json({ error: 'An asset with this serial number already exists' }, { status: 409 })
      }
      if (!knownMessage) {
        console.error('Create asset RPC error:', error)
        return NextResponse.json({ error: 'Unable to save the asset' }, { status: 500 })
      }
      const status = knownMessage.includes('conflicts with an existing asset record') ? 409 : 400
      return NextResponse.json({ error: knownMessage }, { status })
    }

    const result = Array.isArray(rows) ? rows[0] : rows
    if (!result) {
      console.error('Create asset returned no row')
      return NextResponse.json({ error: 'Unable to save the asset' }, { status: 500 })
    }

    if (result.created) {
      await logAudit({
        orgId: actor.organization_id,
        userId: actor.userId,
        userName: actor.full_name,
        action: 'create',
        entityType: 'asset',
        entityId: result.asset_id,
        entityLabel: `${result.asset_code} — ${assetName}`,
        changes: { asset_code: result.asset_code, purchase_cost: Number(purchaseCost), category },
      })
    }

    return NextResponse.json(result, { status: result.created ? 201 : 200 })
  } catch (error: unknown) {
    console.error('Create asset error:', error)
    return NextResponse.json({ error: 'Unable to save the asset' }, { status: 500 })
  }
}
