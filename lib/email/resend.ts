import type { Order, OrderStatus } from '@/lib/types'
import { formatOrderNumber } from '@/lib/orders/format'

/**
 * Plantillas de email por cambio de estado. No mandamos para todos
 * los estados: sólo los que el cliente quiere saber.
 */
const TEMPLATES: Partial<Record<OrderStatus, (name: string, code: string) => { subject: string; text: string }>> = {
  confirmado: (name, code) => ({
    subject: `Confirmamos tu pedido ${code} 🛍️`,
    text: `Hola ${name},\n\nRecibimos y confirmamos tu pedido ${code}. Ya estamos preparándolo y te vamos a avisar cuando salga a entrega.\n\nGracias por elegir Social Ahorro 💚`,
  }),
  en_camino: (name, code) => ({
    subject: `Tu pedido ${code} está en camino 🚴`,
    text: `Hola ${name},\n\nTu pedido ${code} salió para entrega y llega en aproximadamente 30-45 minutos.\n\nSi necesitás coordinar algo respondé este mail o escribinos por WhatsApp.`,
  }),
  entregado: (name, code) => ({
    subject: `Pedido ${code} entregado ✅`,
    text: `Hola ${name},\n\nTu pedido ${code} fue entregado. Gracias por elegir Social Ahorro!\n\nCualquier consulta post-entrega, contestá este mail.`,
  }),
  cancelado: (name, code) => ({
    subject: `Pedido ${code} cancelado`,
    text: `Hola ${name},\n\nTu pedido ${code} fue cancelado. Si fue un error o querés volver a hacerlo, respondé este mail y lo retomamos.`,
  }),
}

/**
 * Envía un email via Resend. Devuelve { ok, error? }. No tira: el
 * caller decide qué hacer.
 *
 * Requiere:
 *   RESEND_API_KEY        (en Vercel env vars)
 *   EMAIL_FROM            (ej: "Social Ahorro <pedidos@socialahorro.com>")
 */
export async function sendStatusEmail(
  order: Pick<Order, 'codigo' | 'customer_name' | 'customer_email'>,
  status: OrderStatus
): Promise<{ ok: boolean; skipped?: string; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  const from   = process.env.EMAIL_FROM
  if (!apiKey || !from) return { ok: false, skipped: 'email_no_configurado' }
  if (!order.customer_email) return { ok: false, skipped: 'sin_email' }

  const tpl = TEMPLATES[status]
  if (!tpl) return { ok: false, skipped: 'estado_sin_plantilla' }

  const name = order.customer_name?.split(' ')[0] || 'Hola'
  const { subject, text } = tpl(name, formatOrderNumber(order as any))

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [order.customer_email],
        subject,
        text,
      }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return { ok: false, error: `resend_${res.status}: ${body.slice(0,200)}` }
    }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'red' }
  }
}
