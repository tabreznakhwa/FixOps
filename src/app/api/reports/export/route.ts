import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/server'

type Range = 'month' | 'last_month' | 'quarter' | 'year' | 'all'

function getDateRange(range: Range): { from: string | null; to: string | null } {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()

  if (range === 'month') {
    return {
      from: new Date(y, m, 1).toISOString().split('T')[0],
      to: new Date(y, m + 1, 0).toISOString().split('T')[0],
    }
  }
  if (range === 'last_month') {
    return {
      from: new Date(y, m - 1, 1).toISOString().split('T')[0],
      to: new Date(y, m, 0).toISOString().split('T')[0],
    }
  }
  if (range === 'quarter') {
    const qStart = Math.floor(m / 3) * 3
    return {
      from: new Date(y, qStart, 1).toISOString().split('T')[0],
      to: new Date(y, qStart + 3, 0).toISOString().split('T')[0],
    }
  }
  if (range === 'year') {
    return {
      from: new Date(y, 0, 1).toISOString().split('T')[0],
      to: new Date(y, 11, 31).toISOString().split('T')[0],
    }
  }
  return { from: null, to: null }
}

export async function GET(request: NextRequest) {
  try {
    const supabaseUser = await createClient()
    const {
      data: { user },
    } = await supabaseUser.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const rawRange = searchParams.get('range') as Range | null
    const range: Range = ['month', 'last_month', 'quarter', 'year', 'all'].includes(rawRange ?? '')
      ? (rawRange as Range)
      : 'month'

    const { from, to } = getDateRange(range)

    const supabase = createAdminClient()

    let query = (supabase as any)
      .from('invoices')
      .select(
        'invoice_number, invoice_date, due_date, status, invoice_type, subtotal, discount_amount, tax_amount, total_amount, amount_paid, balance_due, customers(full_name)',
      )
      .not('status', 'in', '(cancelled,written_off)')
      .order('invoice_date', { ascending: false })

    if (from) query = query.gte('invoice_date', from)
    if (to) query = query.lte('invoice_date', to)

    const { data: rows, error } = await query

    if (error) throw error

    const result = (rows ?? []).map(
      (row: {
        invoice_number: string
        invoice_date: string
        due_date: string | null
        status: string
        invoice_type: string
        subtotal: number
        discount_amount: number
        tax_amount: number
        total_amount: number
        amount_paid: number
        balance_due: number
        customers: { full_name: string } | null
      }) => ({
        invoice_number: row.invoice_number,
        invoice_date: row.invoice_date,
        due_date: row.due_date,
        status: row.status,
        invoice_type: row.invoice_type,
        subtotal: row.subtotal,
        discount_amount: row.discount_amount,
        tax_amount: row.tax_amount,
        total_amount: row.total_amount,
        amount_paid: row.amount_paid,
        balance_due: row.balance_due,
        customer_name: row.customers?.full_name ?? '',
      }),
    )

    return NextResponse.json(result)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err)
    console.error('Reports export error:', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
