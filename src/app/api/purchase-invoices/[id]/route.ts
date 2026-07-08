/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabaseUser = await createClient()
    const { data: { user } } = await supabaseUser.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const supabase = createAdminClient() as any

    if (body.action === 'cancel') {
      const { error } = await supabase
        .from('purchase_invoices')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
      return NextResponse.json({ success: true })
    }

    if (body.action === 'update') {
      const allowed = ['invoice_date', 'due_date', 'payment_type', 'payment_mode', 'payment_status', 'notes']
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
      for (const key of allowed) {
        if (key in body) updates[key] = body[key] === '' ? null : body[key]
      }
      const { error } = await supabase.from('purchase_invoices').update(updates).eq('id', id)
      if (error) throw error
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    console.error('Purchase invoice PATCH error:', err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
