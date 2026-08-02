import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { chat, aiConfig, AIConfigError, AIRequestError } from '@/lib/ai/client'
import { buildBusinessMetrics, metricsToPrompt } from '@/app/(dashboard)/insights/businessMetrics'

// Analyses can take a while on a cheap tier — give the provider room.
export const maxDuration = 120

const SYSTEM_PROMPT = `You are a business advisor to the owner of a small field-service company in Kuwait (AC maintenance, plumbing, electrical, general maintenance). The company bills in Kuwaiti Dinar (KWD, 3 decimal places).

You are given aggregated figures from their own management system. Your job is to tell the owner where the business is actually going and what specifically to do about it.

Rules:
- Ground every claim in the numbers provided. Quote the figure you are reasoning from. Never invent data.
- If the data does not support a conclusion, say so plainly instead of guessing.
- Be direct and specific. "Collections are lagging invoicing by KWD 1,240 a month" beats "improve cash flow".
- Prioritise. Lead with the one or two things that matter most this month.
- Recommendations must be actions the owner can take with what they have — no consultants, no new software, no hiring unless the numbers clearly justify it.
- Keep it tight. This is read on a tablet between jobs.

Structure your answer in markdown with exactly these sections:

## Where the business stands
Two or three sentences on the overall trend. Name the direction and the size of it.

## What is working
The genuinely positive signals, with figures.

## What needs attention
The problems, most serious first, each with the number that reveals it and what it will cost if ignored.

## Revenue opportunities
Concrete ways to increase revenue based on what the data shows about their mix, pricing, conversion and collections.

## Stock governance
Assessment of inventory health: money tied up in unmoved stock, reorder risks, turnover. Name specific items where the data names them.

## Do this month
A numbered list of 3 to 5 specific actions, each one sentence, ordered by impact.`

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profileRaw } = await (supabase as any)
    .from('users').select('organization_id, role').eq('id', user.id).single()
  const profile = profileRaw as { organization_id: string; role: string } | null
  if (!profile?.organization_id) {
    return NextResponse.json({ error: 'No organization found' }, { status: 400 })
  }
  // Financial guidance is owner/admin only — this exposes margins and payroll.
  if (!['owner', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const admin = createAdminClient() as any

  try {
    const metrics = await buildBusinessMetrics(admin, profile.organization_id, { months: 6 })

    // Refuse rather than hallucinate a review of an empty business.
    if (metrics.totals.revenue === 0 && metrics.stock.totalValue === 0) {
      return NextResponse.json(
        { error: 'Not enough trading data in the last 6 months to analyse yet.' },
        { status: 400 }
      )
    }

    const analysis = await chat({
      system: SYSTEM_PROMPT,
      user: `Here are the figures for my business. Give me your assessment.\n\n${metricsToPrompt(metrics)}`,
    })

    const { model } = aiConfig()

    const { data: saved, error: saveError } = await admin
      .from('ai_insights')
      .insert({
        organization_id: profile.organization_id,
        period_from: metrics.periodFrom,
        period_to: metrics.periodTo,
        analysis,
        metrics,
        model,
        generated_by: user.id,
      })
      .select('id')
      .single()

    // A save failure must not throw away an analysis the user already paid for.
    if (saveError) {
      return NextResponse.json({
        success: true,
        analysis,
        metrics,
        saved: false,
        warning: 'Analysis generated but could not be saved for later viewing.',
      })
    }

    return NextResponse.json({ success: true, id: saved.id, analysis, metrics, saved: true })
  } catch (err) {
    if (err instanceof AIConfigError) {
      return NextResponse.json({ error: err.message, needsSetup: true }, { status: 503 })
    }
    if (err instanceof AIRequestError) {
      return NextResponse.json({ error: err.message }, { status: 502 })
    }
    const msg = err instanceof Error ? err.message : 'Failed to generate analysis'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
