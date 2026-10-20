import type { ServiceCategory } from '@/types/database'

export const WORK_ORDER_SERVICE_CATEGORIES = [
  { value: 'ac_maintenance', label: 'AC Maintenance' },
  { value: 'plumbing', label: 'Plumbing' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'general', label: 'General Maintenance' },
  { value: 'installation', label: 'Installation' },
  { value: 'inspection', label: 'Inspection' },
  { value: 'quotation', label: 'Quotation' },
  { value: 'emergency', label: 'Emergency' },
  { value: 'amc_visit', label: 'AMC Visit' },
] as const satisfies ReadonlyArray<{ value: ServiceCategory; label: string }>

const WORK_ORDER_SERVICE_CATEGORY_VALUES = new Set<string>(
  WORK_ORDER_SERVICE_CATEGORIES.map(category => category.value),
)

export function isWorkOrderServiceCategory(value: unknown): value is ServiceCategory {
  return typeof value === 'string' && WORK_ORDER_SERVICE_CATEGORY_VALUES.has(value)
}
