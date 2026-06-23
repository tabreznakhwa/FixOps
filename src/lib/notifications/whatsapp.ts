export interface ComplaintWhatsAppData {
  complaintNumber: string
  customerName: string
  customerMobile: string
  serviceCategory: string
  priority: string
  description: string
  location?: string | null
  submittedAt: string
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

const priorityEmoji: Record<string, string> = {
  emergency: '🚨',
  high: '🔴',
  medium: '🔵',
  low: '⚪',
}

export async function sendComplaintWhatsApp(data: ComplaintWhatsAppData) {
  const instanceId = process.env.ULTRAMSG_INSTANCE_ID
  const token = process.env.ULTRAMSG_TOKEN
  const to = process.env.COMPANY_WHATSAPP_NUMBER

  if (!instanceId || !token || !to) {
    console.warn('WhatsApp config missing — skipping notification')
    return { success: false, error: 'WhatsApp not configured' }
  }

  const emoji = priorityEmoji[data.priority] ?? '🔵'
  const category = categoryLabel[data.serviceCategory] ?? data.serviceCategory

  const message = [
    `${emoji} *New Service Request — FixOps*`,
    ``,
    `📋 *Complaint #:* ${data.complaintNumber}`,
    `👤 *Customer:* ${data.customerName}`,
    `📱 *Mobile:* ${data.customerMobile}`,
    `🛠️ *Service:* ${category}`,
    `⚡ *Priority:* ${data.priority.toUpperCase()}`,
    data.location ? `📍 *Location:* ${data.location}` : null,
    ``,
    `📝 *Description:*`,
    data.description.length > 200 ? data.description.slice(0, 200) + '…' : data.description,
    ``,
    `🕐 *Submitted:* ${data.submittedAt}`,
    ``,
    `Open FixOps dashboard to assign a technician.`,
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const res = await fetch(
      `https://api.ultramsg.com/${instanceId}/messages/chat`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          token,
          to,
          body: message,
          priority: '10',
        }).toString(),
      }
    )

    const json = await res.json()

    if (!res.ok || json.error) {
      console.error('WhatsApp send error:', json)
      return { success: false, error: json.error ?? 'Unknown error' }
    }

    return { success: true, data: json }
  } catch (err) {
    console.error('WhatsApp send failed:', err)
    return { success: false, error: err }
  }
}
