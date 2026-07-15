import { NextRequest, NextResponse } from 'next/server'

// ---------------------------------------------------------------------------
// Simple sliding-window rate limiter (in-memory, per edge-worker instance).
// For global enforcement across all Vercel edge nodes, swap the Map for
// Upstash Redis / Vercel KV. This already stops naive bots and flood attacks.
// ---------------------------------------------------------------------------

interface RLEntry { count: number; resetAt: number }
const rl = new Map<string, RLEntry>()

// Prune stale entries every ~500 requests so the map doesn't grow forever.
let pruneCounter = 0
function pruneExpired() {
  if (++pruneCounter % 500 !== 0) return
  const now = Date.now()
  for (const [k, v] of rl) {
    if (now > v.resetAt) rl.delete(k)
  }
}

function allow(key: string, limit: number, windowMs: number): boolean {
  pruneExpired()
  const now = Date.now()
  const entry = rl.get(key)
  if (!entry || now > entry.resetAt) {
    rl.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (entry.count >= limit) return false
  entry.count++
  return true
}

function getIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  )
}

function tooMany(retryAfterSecs: number) {
  return NextResponse.json(
    { error: 'Too many requests. Please try again later.' },
    { status: 429, headers: { 'Retry-After': String(retryAfterSecs) } },
  )
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const { method } = request
  const ip = getIp(request)

  // 1. Public complaint portal: 5 submissions per hour per IP
  if (pathname === '/api/complaints/public' && method === 'POST') {
    if (!allow(`cmp:${ip}`, 5, 60 * 60 * 1000)) return tooMany(3600)
  }

  // 2. Auth endpoints: 15 attempts per 15 minutes per IP (brute-force guard)
  if (pathname.startsWith('/api/auth/') && method === 'POST') {
    if (!allow(`auth:${ip}`, 15, 15 * 60 * 1000)) return tooMany(900)
  }

  // 3. All other API routes: 300 requests per minute per IP (DDoS guard)
  if (pathname.startsWith('/api/') && !pathname.startsWith('/api/auth/callback')) {
    if (!allow(`api:${ip}`, 300, 60 * 1000)) return tooMany(60)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/api/:path*'],
}
