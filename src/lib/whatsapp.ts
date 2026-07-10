/**
 * Meta WhatsApp Cloud API helper.
 * Requires env vars:
 *   WHATSAPP_PHONE_NUMBER_ID  — from Meta Developer Console
 *   WHATSAPP_ACCESS_TOKEN     — permanent system user token
 *   WHATSAPP_TEMPLATE_NAME    — approved template name (default: "job_assigned")
 */

export async function sendWhatsAppMessage(
  to: string,
  params: string[],
): Promise<void> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN
  const templateName = process.env.WHATSAPP_TEMPLATE_NAME ?? 'job_assigned'

  if (!phoneNumberId || !accessToken) {
    console.warn('WhatsApp env vars not configured — skipping notification')
    return
  }

  // Strip non-digits; Kuwait numbers start with 965
  const phone = to.replace(/\D/g, '')
  if (!phone) return

  const body = {
    messaging_product: 'whatsapp',
    to: phone,
    type: 'template',
    template: {
      name: templateName,
      language: { code: 'en' },
      components: [
        {
          type: 'body',
          parameters: params.map(text => ({ type: 'text', text })),
        },
      ],
    },
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    )
    if (!res.ok) {
      const err = await res.json()
      console.error('WhatsApp API error:', JSON.stringify(err))
    }
  } catch (err) {
    console.error('WhatsApp send failed:', err)
  }
}
