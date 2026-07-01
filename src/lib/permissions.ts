export type Permission = 'full' | 'view' | 'none'

export type ModuleKey = 'operations' | 'finance' | 'hr' | 'inventory' | 'reports' | 'settings'

export type ModuleAccess = Record<ModuleKey, Permission>

// Fallback defaults used when no custom DB permissions exist for a role
export const DEFAULT_PERMISSIONS: Record<string, ModuleAccess> = {
  owner:              { operations: 'full', finance: 'full', hr: 'full', inventory: 'full', reports: 'full', settings: 'full' },
  admin:              { operations: 'full', finance: 'full', hr: 'full', inventory: 'full', reports: 'full', settings: 'full' },
  manager:            { operations: 'full', finance: 'view', hr: 'view', inventory: 'view', reports: 'full', settings: 'none' },
  call_center:        { operations: 'full', finance: 'none', hr: 'none', inventory: 'none', reports: 'none', settings: 'none' },
  technician:         { operations: 'view', finance: 'none', hr: 'none', inventory: 'view', reports: 'none', settings: 'none' },
  accounts:           { operations: 'view', finance: 'none', hr: 'view', inventory: 'view', reports: 'full', settings: 'none' },
  hr:                 { operations: 'view', finance: 'none', hr: 'full', inventory: 'none', reports: 'view', settings: 'none' },
  store:              { operations: 'view', finance: 'none', hr: 'none', inventory: 'full', reports: 'none', settings: 'none' },
  attendance_kiosk:   { operations: 'none', finance: 'none', hr: 'view', inventory: 'none', reports: 'none', settings: 'none' },
}

// Roles that are always locked to full access — cannot be restricted
export const LOCKED_ROLES = ['owner', 'admin']

// Configurable roles (non-locked)
export const CONFIGURABLE_ROLES = ['manager', 'call_center', 'technician', 'accounts', 'hr', 'store', 'attendance_kiosk']

// Maps route prefixes → module key
export const ROUTE_MODULE: [string, ModuleKey][] = [
  ['/settings', 'settings'],
  ['/reports', 'reports'],
  ['/finance', 'finance'],
  ['/amc', 'finance'],
  ['/staff', 'hr'],
  ['/attendance', 'hr'],
  ['/payroll', 'hr'],
  ['/inventory', 'inventory'],
  ['/suppliers', 'inventory'],
  ['/complaints', 'operations'],
  ['/work-orders', 'operations'],
  ['/customers', 'operations'],
  ['/dashboard', 'operations'],
]

export function getRouteModule(pathname: string): ModuleKey | null {
  return ROUTE_MODULE.find(([prefix]) => pathname.startsWith(prefix))?.[1] ?? null
}

export function getDefaultPermission(role: string, module: ModuleKey): Permission {
  return DEFAULT_PERMISSIONS[role]?.[module] ?? 'none'
}

export const ALL_MODULES: ModuleKey[] = ['operations', 'finance', 'hr', 'inventory', 'reports', 'settings']

export const MODULE_LABELS: Record<ModuleKey, string> = {
  operations: 'Operations',
  finance: 'Finance',
  hr: 'HR & Payroll',
  inventory: 'Inventory',
  reports: 'Reports',
  settings: 'Settings',
}

export const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  manager: 'Manager',
  call_center: 'Call Center',
  technician: 'Technician',
  accounts: 'Accounts',
  hr: 'HR',
  store: 'Store / Inventory',
  attendance_kiosk: 'Attendance Kiosk',
}

export const ALL_ROLES = Object.keys(ROLE_LABELS)
