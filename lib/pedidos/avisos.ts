/**
 * LOS AVISOS AL CLIENTE.
 *
 * ── LO REVERSIBLE SALE SOLO; LO QUE COMPROMETE, FIRMA ───────────────────────
 *
 * Es la regla que ya usa el resto del sistema, aplicada acá:
 *
 *   «Salió tu pedido»       es un hecho que ya pasó. Se prepara y listo.
 *   «Llega en 10 minutos»   es una promesa sobre el futuro. Alguien la firma.
 *   «Hubo una demora»       compromete a la casa. Alguien la firma.
 *
 * ── WHATSAPP NO SE INTEGRA ──────────────────────────────────────────────────
 *
 * Es la app común del negocio, sin API. NORA deja el mensaje armado con el
 * pedido y el total, y una persona lo copia y lo manda. Cuando haya API —o
 * Telegram— se conecta; hasta entonces, decir que "se envió" sería mentir.
 */

import type { OrderStatus } from '@/lib/types'

export type TipoAviso =
  | 'confirmado' | 'salio' | 'por_llegar' | 'entregado' | 'demora'

export const AVISO_LABELS: Record<TipoAviso, string> = {
  confirmado:  'Confirmado',
  salio:       'Salió tu pedido',
  por_llegar:  'Está por llegar',
  entregado:   'Entregado',
  demora:      'Hubo una demora',
}

/**
 * Cuáles comprometen algo. Los que sí esperan que alguien los confirme antes de
 * quedar listos para mandar.
 */
export const AVISO_REQUIERE_FIRMA: Record<TipoAviso, boolean> = {
  confirmado:  false,  // es un hecho: el pedido entró
  salio:       false,  // es un hecho: la moto arrancó
  entregado:   false,  // es un hecho: llegó
  por_llegar:  true,   // promete una hora
  demora:      true,   // compromete a la casa
}

export const AVISO_POR_QUE_FIRMA: Partial<Record<TipoAviso, string>> = {
  por_llegar: 'Promete una hora de llegada. Si no se cumple, el que queda mal es el negocio.',
  demora:     'Es una disculpa en nombre de la casa. La firma alguien que se hace cargo.',
}

/** El estado del pedido que dispara cada aviso automático, si lo hay. */
export const AVISO_DE_ESTADO: Partial<Record<OrderStatus, TipoAviso>> = {
  confirmado: 'confirmado',
  en_camino:  'salio',
  entregado:  'entregado',
}

export function textoDeAviso(tipo: TipoAviso, o: {
  nombre: string | null
  codigo: string
  total: number
  minutos?: number
}): string {
  const n = o.nombre?.split(' ')[0] || 'Hola'
  const plata = o.total.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })
  switch (tipo) {
    case 'confirmado':
      return `Hola ${n}! Confirmamos tu pedido ${o.codigo} por ${plata}. Te avisamos cuando salga.`
    case 'salio':
      return `Hola ${n}! Salió tu pedido ${o.codigo}. Total ${plata}.`
    case 'por_llegar':
      return `Hola ${n}! Tu pedido ${o.codigo} está por llegar, en unos ${o.minutos ?? 10} minutos.`
    case 'entregado':
      return `Hola ${n}! Tu pedido ${o.codigo} fue entregado. Gracias por elegir Social Ahorro.`
    case 'demora':
      return `Hola ${n}, tu pedido ${o.codigo} se está demorando. Perdón. Te avisamos apenas salga.`
  }
}

/** El link de wa.me con el mensaje ya cargado, para copiar o abrir. */
export function linkWhatsApp(telefono: string | null, texto: string): string | null {
  if (!telefono) return null
  const d = telefono.replace(/\D/g, '')
  if (!d) return null
  const num = d.startsWith('54') ? d : d.startsWith('0') ? `549${d.replace(/^0+/, '')}` : `549${d}`
  return `https://wa.me/${num}?text=${encodeURIComponent(texto)}`
}
