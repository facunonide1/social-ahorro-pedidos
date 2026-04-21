import { MANUAL_ORIGIN_PREFIX } from '@/lib/types'
import type { Order, OrderOrigin } from '@/lib/types'

function pad(n: number, width = 3) {
  return String(n).padStart(width, '0')
}

/**
 * Número mostrable del pedido:
 *  - Web (Woo):  "#12345"
 *  - Manual:     "#WSP-001" / "#TEL-001" / etc.
 */
export function formatOrderNumber(order: Pick<Order, 'origin' | 'woo_order_id' | 'manual_order_number'>): string {
  if (order.origin === 'woo') return `#${order.woo_order_id ?? '—'}`
  const prefix = MANUAL_ORIGIN_PREFIX[order.origin as Exclude<OrderOrigin, 'woo'>] ?? 'M'
  return `#${prefix}-${pad(order.manual_order_number ?? 0)}`
}
