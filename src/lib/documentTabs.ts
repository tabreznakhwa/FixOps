import { safeReturnTo } from '@/lib/backNav'

export type DocumentKind =
  | 'invoice'
  | 'quotation'
  | 'purchase-invoice'
  | 'purchase-order'
  | 'payslip'
  | 'work-order'
  | 'complaint'

export interface DocumentRoute {
  href: string
  kind: DocumentKind
  tabKey: string
  fallbackLabel: string
}

export const MAX_DOCUMENT_LABEL_LENGTH = 120
export const MAX_DOCUMENT_HREF_LENGTH = 8192

const INTERNAL_ORIGIN = 'https://fixops.internal'
const CONTROL_CHARACTERS_GLOBAL = /[\u0000-\u001f\u007f]/g
const SAFE_SEGMENT = /^[A-Za-z0-9_-]+$/
const RESERVED_SEGMENTS = new Set(['new', 'edit', 'merge', 'print-batch'])

type RouteDefinition = {
  kind: DocumentKind
  pattern: RegExp
  fallbackLabel: string
  key: (segments: string[]) => string
}

const DOCUMENT_ROUTES: RouteDefinition[] = [
  {
    kind: 'invoice',
    pattern: /^\/finance\/invoices\/([^/]+)\/?$/,
    fallbackLabel: 'Invoice',
    key: ([id]) => `document:invoice:${id}`,
  },
  {
    kind: 'quotation',
    pattern: /^\/finance\/quotations\/([^/]+)\/?$/,
    fallbackLabel: 'Quotation',
    key: ([id]) => `document:quotation:${id}`,
  },
  {
    kind: 'purchase-invoice',
    pattern: /^\/inventory\/purchase-invoices\/([^/]+)\/?$/,
    fallbackLabel: 'Purchase Invoice',
    key: ([id]) => `document:purchase-invoice:${id}`,
  },
  {
    kind: 'purchase-order',
    pattern: /^\/suppliers\/po\/([^/]+)\/?$/,
    fallbackLabel: 'Purchase Order',
    key: ([id]) => `document:purchase-order:${id}`,
  },
  {
    kind: 'payslip',
    pattern: /^\/payroll\/slips\/([^/]+)\/([^/]+)\/?$/,
    fallbackLabel: 'Payslip',
    key: ([runId, staffId]) => `document:payslip:${runId}:${staffId}`,
  },
  {
    kind: 'work-order',
    pattern: /^\/work-orders\/([^/]+)\/?$/,
    fallbackLabel: 'Work Order',
    key: ([id]) => `document:work-order:${id}`,
  },
  {
    kind: 'complaint',
    pattern: /^\/complaints\/([^/]+)\/?$/,
    fallbackLabel: 'Complaint',
    key: ([id]) => `document:complaint:${id}`,
  },
]

function safeRouteSegments(match: RegExpMatchArray): string[] | null {
  const segments: string[] = []
  for (const rawSegment of match.slice(1)) {
    let decoded: string
    try {
      decoded = decodeURIComponent(rawSegment)
    } catch {
      return null
    }

    if (
      !decoded ||
      decoded === '.' ||
      decoded === '..' ||
      decoded.length > 200 ||
      RESERVED_SEGMENTS.has(decoded.toLowerCase()) ||
      !SAFE_SEGMENT.test(decoded)
    ) {
      return null
    }
    segments.push(decoded)
  }
  return segments
}

/** Validate and classify one exact read-only formal-document detail route. */
export function parseDocumentRoute(candidate: string): DocumentRoute | null {
  if (typeof candidate !== 'string' || candidate.length > MAX_DOCUMENT_HREF_LENGTH) return null

  const href = safeReturnTo(candidate)
  if (!href) return null

  let url: URL
  try {
    url = new URL(href, INTERNAL_ORIGIN)
  } catch {
    return null
  }

  for (const definition of DOCUMENT_ROUTES) {
    const match = url.pathname.match(definition.pattern)
    if (!match) continue

    const segments = safeRouteSegments(match)
    if (!segments) return null

    const pathname = url.pathname.length > 1 && url.pathname.endsWith('/')
      ? url.pathname.slice(0, -1)
      : url.pathname

    return {
      href: `${pathname}${url.search}${url.hash}`,
      kind: definition.kind,
      tabKey: definition.key(segments),
      fallbackLabel: definition.fallbackLabel,
    }
  }

  return null
}

export function sanitizeDocumentLabel(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const normalized = value.replace(CONTROL_CHARACTERS_GLOBAL, ' ').replace(/\s+/g, ' ').trim()
  return normalized ? normalized.slice(0, MAX_DOCUMENT_LABEL_LENGTH) : fallback
}
