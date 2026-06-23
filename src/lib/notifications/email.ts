import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export interface ComplaintEmailData {
  complaintNumber: string
  customerName: string
  customerMobile: string
  customerEmail?: string | null
  serviceCategory: string
  priority: string
  description: string
  location?: string | null
  preferredDate?: string | null
  submittedAt: string
  portalUrl: string
}

export async function sendComplaintAlertEmail(data: ComplaintEmailData) {
  const priorityColor: Record<string, string> = {
    emergency: '#dc2626',
    high: '#ea580c',
    medium: '#2563eb',
    low: '#64748b',
  }

  const priorityEmoji: Record<string, string> = {
    emergency: '🚨',
    high: '🔴',
    medium: '🔵',
    low: '⚪',
  }

  const categoryLabel: Record<string, string> = {
    ac_maintenance: '❄️ AC Maintenance',
    plumbing: '🔧 Plumbing',
    electrical: '⚡ Electrical',
    general: '🔨 General Maintenance',
    emergency: '🚨 Emergency',
    amc_visit: '📋 AMC Visit',
    installation: '🏗️ Installation',
    inspection: '🔍 Inspection',
    quotation: '📝 Quotation',
  }

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:600px;margin:24px auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

    <!-- Header -->
    <div style="background:#0f172a;padding:24px 32px;display:flex;align-items:center;">
      <div style="background:#2563eb;width:40px;height:40px;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;margin-right:12px;">
        <span style="color:white;font-size:20px;">🔧</span>
      </div>
      <div style="display:inline-block;vertical-align:middle;">
        <div style="color:#ffffff;font-size:18px;font-weight:700;">FixOps</div>
        <div style="color:#94a3b8;font-size:12px;">New Complaint Received</div>
      </div>
    </div>

    <!-- Priority Banner -->
    <div style="background:${priorityColor[data.priority] ?? '#2563eb'};padding:12px 32px;">
      <span style="color:white;font-size:14px;font-weight:700;">
        ${priorityEmoji[data.priority] ?? '🔵'} ${data.priority.toUpperCase()} PRIORITY — ${data.complaintNumber}
      </span>
    </div>

    <!-- Body -->
    <div style="padding:32px;">
      <h2 style="margin:0 0 24px;font-size:20px;color:#0f172a;">New Service Request</h2>

      <!-- Customer Info -->
      <div style="background:#f8fafc;border-radius:12px;padding:20px;margin-bottom:20px;border:1px solid #e2e8f0;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;font-weight:600;margin-bottom:12px;">CUSTOMER</div>
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="padding:4px 0;color:#64748b;font-size:13px;width:120px;">Name</td>
            <td style="padding:4px 0;color:#0f172a;font-size:13px;font-weight:600;">${data.customerName}</td>
          </tr>
          <tr>
            <td style="padding:4px 0;color:#64748b;font-size:13px;">Mobile</td>
            <td style="padding:4px 0;color:#0f172a;font-size:13px;font-weight:600;">
              <a href="tel:${data.customerMobile}" style="color:#2563eb;text-decoration:none;">${data.customerMobile}</a>
            </td>
          </tr>
          ${data.customerEmail ? `
          <tr>
            <td style="padding:4px 0;color:#64748b;font-size:13px;">Email</td>
            <td style="padding:4px 0;color:#0f172a;font-size:13px;">${data.customerEmail}</td>
          </tr>` : ''}
          ${data.location ? `
          <tr>
            <td style="padding:4px 0;color:#64748b;font-size:13px;">Location</td>
            <td style="padding:4px 0;color:#0f172a;font-size:13px;">${data.location}</td>
          </tr>` : ''}
        </table>
      </div>

      <!-- Complaint Info -->
      <div style="background:#f8fafc;border-radius:12px;padding:20px;margin-bottom:20px;border:1px solid #e2e8f0;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;font-weight:600;margin-bottom:12px;">COMPLAINT DETAILS</div>
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="padding:4px 0;color:#64748b;font-size:13px;width:120px;">Service</td>
            <td style="padding:4px 0;color:#0f172a;font-size:13px;font-weight:600;">${categoryLabel[data.serviceCategory] ?? data.serviceCategory}</td>
          </tr>
          <tr>
            <td style="padding:4px 0;color:#64748b;font-size:13px;">Priority</td>
            <td style="padding:4px 0;">
              <span style="background:${priorityColor[data.priority] ?? '#2563eb'};color:white;padding:2px 10px;border-radius:20px;font-size:12px;font-weight:700;text-transform:uppercase;">${data.priority}</span>
            </td>
          </tr>
          ${data.preferredDate ? `
          <tr>
            <td style="padding:4px 0;color:#64748b;font-size:13px;">Preferred Date</td>
            <td style="padding:4px 0;color:#0f172a;font-size:13px;">${data.preferredDate}</td>
          </tr>` : ''}
          <tr>
            <td style="padding:4px 0;color:#64748b;font-size:13px;">Submitted</td>
            <td style="padding:4px 0;color:#0f172a;font-size:13px;">${data.submittedAt}</td>
          </tr>
        </table>
      </div>

      <!-- Description -->
      <div style="background:#fefce8;border:1px solid #fde047;border-radius:12px;padding:20px;margin-bottom:24px;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#92400e;font-weight:600;margin-bottom:8px;">COMPLAINT DESCRIPTION</div>
        <p style="margin:0;color:#1c1917;font-size:14px;line-height:1.6;">${data.description}</p>
      </div>

      <!-- CTA -->
      <div style="text-align:center;">
        <a href="${data.portalUrl}/complaints" style="display:inline-block;background:#2563eb;color:white;padding:14px 32px;border-radius:12px;text-decoration:none;font-weight:700;font-size:14px;">
          View in FixOps Dashboard →
        </a>
      </div>
    </div>

    <!-- Footer -->
    <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 32px;text-align:center;">
      <p style="margin:0;font-size:12px;color:#94a3b8;">
        FixOps Maintenance Management · Complaint ${data.complaintNumber}
      </p>
    </div>
  </div>
</body>
</html>
`

  try {
    const { data: result, error } = await resend.emails.send({
      from: 'FixOps Alerts <alerts@fixops.io>',
      to: [process.env.COMPANY_ALERT_EMAIL!],
      subject: `${priorityEmoji[data.priority] ?? '🔵'} New ${data.priority.toUpperCase()} Complaint — ${data.complaintNumber} | ${data.customerName}`,
      html,
    })

    if (error) {
      console.error('Email send error:', error)
      return { success: false, error }
    }

    return { success: true, data: result }
  } catch (err) {
    console.error('Email send failed:', err)
    return { success: false, error: err }
  }
}
