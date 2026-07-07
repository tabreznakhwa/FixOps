import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') ?? '').trim()

  if (!q) return NextResponse.json([])

  const supabase = await createClient()

  // Run name and mobile searches in parallel to avoid .or() issues with special chars like /
  const [{ data: byName }, { data: byMobile }, { data: byCode }] = await Promise.all([
    supabase
      .from('customers')
      .select('id, full_name, company_name, mobile_number, customer_code')
      .eq('status', 'active')
      .ilike('full_name', `%${q}%`)
      .order('full_name')
      .limit(8),
    supabase
      .from('customers')
      .select('id, full_name, company_name, mobile_number, customer_code')
      .eq('status', 'active')
      .ilike('mobile_number', `%${q}%`)
      .order('full_name')
      .limit(8),
    supabase
      .from('customers')
      .select('id, full_name, company_name, mobile_number, customer_code')
      .eq('status', 'active')
      .ilike('customer_code', `%${q}%`)
      .order('full_name')
      .limit(8),
  ])

  // Merge and deduplicate, name matches first
  const seen = new Set<string>()
  const results: typeof byName = []
  for (const row of [...(byName ?? []), ...(byMobile ?? []), ...(byCode ?? [])]) {
    if (!seen.has(row.id)) { seen.add(row.id); results.push(row) }
    if (results.length >= 8) break
  }

  return NextResponse.json(results)
}
