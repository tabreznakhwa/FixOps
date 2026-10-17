// Shared asset-register constants, validation and depreciation helpers.
//
// Depreciation is straight-line and computed on demand — never stored — so the
// current book value cannot go stale. Money is handled as decimal strings at
// the HTTP/RPC boundary and rounded to three decimal KWD (one fils) here.

export const ASSET_CATEGORIES = [
  'it_equipment',
  'tools_equipment',
  'vehicles',
  'furniture_fixtures',
  'machinery',
  'office_equipment',
  'leasehold_improvements',
  'safety_equipment',
  'other',
] as const
export type AssetCategory = (typeof ASSET_CATEGORIES)[number]

export const ASSET_CATEGORY_LABELS: Record<AssetCategory, string> = {
  it_equipment: 'IT Equipment',
  tools_equipment: 'Tools & Equipment',
  vehicles: 'Vehicles',
  furniture_fixtures: 'Furniture & Fixtures',
  machinery: 'Machinery',
  office_equipment: 'Office Equipment',
  leasehold_improvements: 'Leasehold Improvements',
  safety_equipment: 'Safety Equipment',
  other: 'Other',
}

export const ASSET_CONDITIONS = ['excellent', 'good', 'fair', 'poor', 'out_of_service'] as const
export type AssetCondition = (typeof ASSET_CONDITIONS)[number]

export const ASSET_CONDITION_LABELS: Record<AssetCondition, string> = {
  excellent: 'Excellent',
  good: 'Good',
  fair: 'Fair',
  poor: 'Poor',
  out_of_service: 'Out of Service',
}

export const ASSET_STATUSES = ['available', 'assigned', 'maintenance', 'disposed'] as const
export type AssetStatus = (typeof ASSET_STATUSES)[number]

export const ASSET_STATUS_LABELS: Record<AssetStatus, string> = {
  available: 'Available',
  assigned: 'Assigned',
  maintenance: 'Under Maintenance',
  disposed: 'Disposed',
}

export const ASSET_PAYMENT_METHODS = ['cash', 'bank_transfer', 'cheque'] as const
export type AssetPaymentMethod = (typeof ASSET_PAYMENT_METHODS)[number]

export const ASSET_PAYMENT_METHOD_LABELS: Record<AssetPaymentMethod, string> = {
  cash: 'Cash',
  bank_transfer: 'Bank Transfer',
  cheque: 'Cheque',
}

export const DISPOSAL_METHODS = ['sold', 'scrapped', 'donated', 'lost', 'other'] as const
export type DisposalMethod = (typeof DISPOSAL_METHODS)[number]

export const DISPOSAL_METHOD_LABELS: Record<DisposalMethod, string> = {
  sold: 'Sold',
  scrapped: 'Scrapped',
  donated: 'Donated',
  lost: 'Lost',
  other: 'Other',
}

export const ASSET_VIEW_ROLES = ['owner', 'admin', 'manager'] as const
export const ASSET_EDIT_ROLES = ['owner', 'admin'] as const

export function canViewAssets(role: string): boolean {
  return (ASSET_VIEW_ROLES as readonly string[]).includes(role)
}

export function canEditAssets(role: string): boolean {
  return (ASSET_EDIT_ROLES as readonly string[]).includes(role)
}

/** True only for a real, round-trippable `YYYY-MM-DD` date. */
export function isValidISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

/** A non-empty decimal string/number with at most three decimal places. */
export function isValidMoney(value: unknown): boolean {
  if (typeof value === 'number') {
    return Number.isFinite(value) && Math.abs(value * 1000 - Math.round(value * 1000)) < 1e-7
  }
  if (typeof value !== 'string') return false
  if (!/^\d{1,9}(\.\d{1,3})?$/.test(value.trim())) return false
  return true
}

/** Whole calendar months elapsed from start to end (0 when end is on/before). */
export function completedMonthsBetween(startISO: string, endISO: string): number {
  const [sy, sm, sd] = startISO.split('-').map(Number)
  const [ey, em, ed] = endISO.split('-').map(Number)
  let months = (ey - sy) * 12 + (em - sm)
  if (ed < sd) months--
  return Math.max(0, months)
}

function round3(n: number): number {
  return Math.round((n + Number.EPSILON) * 1000) / 1000
}

export interface DepreciationInput {
  purchase_cost: number
  salvage_value: number
  useful_life_months: number | null
  depreciation_start_date: string | null
  /** Cutoff date; the asset's disposal date when disposed, else the valuation date. */
  valuation_date: string
}

export type DepreciationResult =
  | { available: false; reason: string }
  | {
      available: true
      cost: number
      salvage: number
      depreciableBase: number
      monthlyDepreciation: number
      completedMonths: number
      accumulatedDepreciation: number
      bookValue: number
    }

/**
 * Straight-line depreciation to three decimal KWD.
 *   base        = max(cost - salvage, 0)
 *   accumulated = base × completedMonths / usefulLifeMonths  (capped at base)
 *   book value  = max(salvage, cost - accumulated)
 * Incomplete legacy data returns `{ available: false }` rather than guessing.
 */
export function computeDepreciation(input: DepreciationInput): DepreciationResult {
  const { purchase_cost: cost, salvage_value: salvage, useful_life_months: life, depreciation_start_date: start, valuation_date: end } = input

  if (!Number.isFinite(cost) || cost <= 0) return { available: false, reason: 'Purchase cost is missing' }
  if (life == null || !Number.isInteger(life) || life < 1) return { available: false, reason: 'Useful life is missing' }
  if (!start || !isValidISODate(start)) return { available: false, reason: 'Depreciation start date is missing' }
  if (!end || !isValidISODate(end)) return { available: false, reason: 'Valuation date is missing' }

  const safeSalvage = Number.isFinite(salvage) ? salvage : 0
  const depreciableBase = Math.max(round3(cost - safeSalvage), 0)
  const completedMonths = Math.min(completedMonthsBetween(start, end), life)
  const monthlyDepreciation = round3(depreciableBase / life)
  const accumulatedDepreciation = round3(
    Math.min(depreciableBase, (depreciableBase * completedMonths) / life),
  )
  const bookValue = round3(Math.max(safeSalvage, cost - accumulatedDepreciation))

  return {
    available: true,
    cost: round3(cost),
    salvage: round3(safeSalvage),
    depreciableBase,
    monthlyDepreciation,
    completedMonths,
    accumulatedDepreciation,
    bookValue,
  }
}

/** Disposal gain/loss = proceeds − book value at disposal. */
export function disposalGainLoss(
  proceeds: number | null,
  bookValueAtDisposal: number,
): number | null {
  if (proceeds == null || !Number.isFinite(proceeds)) return null
  return round3(proceeds - bookValueAtDisposal)
}
