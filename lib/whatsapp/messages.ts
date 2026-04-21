import type { OrderStatus } from '@/lib/types'

/**
 * Normaliza telefono a formato WhatsApp (solo digitos, con prefijo internacional).
 * Argentina: si no trae 54, lo asumimos local y prependemos 549 (movil).
 */
export function normalizePhoneForWhatsApp(raw: string | null | undefined): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  if (!digits) return null
  if (digits.startsWith('54')) return digits
  if (digits.startsWith('0')) return `549${digits.replace(/^0+/, '')}`
  return `549${digits}`
}

export function messageForStatus(status: OrderStatus, opts: {
  customerName: string | null
  wooOrderId: number
}): string {
  const name = opts.customerName?.split(' ')[0] || 'Hola'
  const n = `#${opts.wooOrderId}`
  switch (status) {
    case 'nuevo':
      return `Hola ${name}! Recibimos tu pedido ${n}. Te avisamos cuando lo confirmemos.`
    case 'confirmado':
      return `Hola ${name}! Confirmamos tu pedido ${n}. Te avisamos cuando este listo.`
    case 'en_preparacion':
      return `Hola ${name}! Estamos preparando tu pedido ${n}. Te avisamos apenas salga.`
    case 'listo':
      return `Hola ${name}! Tu pedido ${n} esta listo. Te lo llevamos en breve.`
    case 'en_camino':
      return `Hola ${name}! Salimos con tu pedido ${n}. Llega en instantes.`
    case 'entregado':
      return `Hola ${name}! Tu pedido ${n} fue entregado. Gracias por elegir Social Ahorro!`
    case 'cancelado':
      return `Hola ${name}, lamentamos avisarte que tu pedido ${n} fue cancelado. Cualquier duda estamos a disposicion.`
  }
}

export function whatsappLink(phone: string | null | undefined, text: string): string | null {
  const p = normalizePhoneForWhatsApp(phone)
  if (!p) return null
  return `https://wa.me/${p}?text=${encodeURIComponent(text)}`
}
