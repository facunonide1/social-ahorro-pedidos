import type { Order } from '@/lib/types'

/**
 * Identificador visible del pedido. A partir de Fase A3 es siempre
 * `SA-YYYY-XXXX` (columna `codigo`, asignada por trigger en la DB).
 */
export function formatOrderNumber(order: Pick<Order, 'codigo'>): string {
  return order.codigo
}
