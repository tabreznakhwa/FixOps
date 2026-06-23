import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { sendComplaintAlertEmail } from '@/lib/notifications/email'
import { sendComplaintWhatsApp } from '@/lib/notifications/whatsapp'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      customerName,
      customerMobile,
      customerEmail,
      serviceCategory,
      priority = 'medium',
      description,
      location,
      preferredDate,
      organizationSlug,
    } = body

    if (!customerName || !customerMobile || !serviceCategory || !description) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Find the org — use slug if provided, else fall back to first org
    let orgId: string
    if (organizationSlug) {
      const { data: org } = await (supabase as any)
        .from('organizations')
        .select('id')
        .eq('slug', organizationSlug)
        .single()
      if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
      orgId = org.id
    } else {
      const { data: orgs } = await (supabase as any)
        .from('organizations')
        .select('id')
        .eq('is_active', true)
        .limit(1)
      if (!orgs?.length) return NextResponse.json({ error: 'No active organization' }, { status: 404 })
      orgId = orgs[0].id
    }

    // Upsert customer by mobile number
    const { data: existingCustomers } = await (supabase as any)
      .from('customers')
      .select('id')
      .eq('organization_id', orgId)
      .eq('mobile_number', customerMobile)
      .limit(1)

    let customerId: string

    if (existingCustomers?.length) {
      customerId = existingCustomers[0].id
    } else {
      const { data: newCustomer, error: customerError } = await (supabase as any)
        .from('customers')
        .insert({
          organization_id: orgId,
          full_name: customerName,
          mobile_number: customerMobile,
          email: customerEmail ?? null,
          customer_type: 'individual',
          status: 'active',
        })
        .select('id')
        .single()

      if (customerError) throw customerError
      customerId = newCustomer.id
    }

    // Generate complaint number
    const { data: seqData } = await (supabase as any).rpc('generate_sequence_number', {
      p_org_id: orgId,
      p_type: 'complaint',
      p_prefix: 'CMP',
    })
    const complaintNumber = seqData ?? `CMP-${Date.now()}`

    // Insert complaint
    const { data: complaint, error: complaintError } = await (supabase as any)
      .from('complaints')
      .insert({
        organization_id: orgId,
        customer_id: customerId,
        complaint_number: complaintNumber,
        title: `${categoryLabel[serviceCategory] ?? serviceCategory} — ${customerName}`,
        description,
        category: serviceCategory,
        priority,
        status: 'open',
        preferred_date: preferredDate ?? null,
        source: 'portal',
        location_address: location ?? null,
      })
      .select('id, complaint_number')
      .single()

    if (complaintError) throw complaintError

    // Fire notifications in parallel (non-blocking — errors are logged, not thrown)
    const submittedAt = new Date().toLocaleString('en-AE', {
      timeZone: 'Asia/Dubai',
      dateStyle: 'medium',
      timeStyle: 'short',
    })
    const portalUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

    await Promise.allSettled([
      sendComplaintAlertEmail({
        complaintNumber: complaint.complaint_number,
        customerName,
        customerMobile,
        customerEmail,
        serviceCategory,
        priority,
        description,
        location,
        preferredDate,
        submittedAt,
        portalUrl,
      }),
      sendComplaintWhatsApp({
        complaintNumber: complaint.complaint_number,
        customerName,
        customerMobile,
        serviceCategory,
        priority,
        description,
        location,
        submittedAt,
      }),
    ])

    return NextResponse.json({
      success: true,
      complaintNumber: complaint.complaint_number,
      complaintId: complaint.id,
    })
  } catch (err) {
    console.error('Public complaint submission error:', err)
    return NextResponse.json({ error: 'Failed to submit complaint' }, { status: 500 })
  }
}

const categoryLabel: Record<string, string> = {
  ac_maintenance: 'AC Maintenance',
  plumbing: 'Plumbing',
  electrical: 'Electrical',
  general: 'General Maintenance',
  emergency: 'Emergency',
  amc_visit: 'AMC Visit',
  installation: 'Installation',
  inspection: 'Inspection',
  quotation: 'Quotation',
}
