import { createAdminClient } from '@/lib/supabase/server'
import { fetchOrders, type WooOrder, type WooLineItem } from './client'
import type { OrderItem } from '@/lib/types'

function mapItems(items: WooLineItem[]): OrderItem[] {
  return items.map(it => ({
    product_id: it.product_id,
    name: it.name,
    qty: it.quantity,
    price: Number(it.price) || Number(it.total) / Math.max(1, it.quantity),
    sku: it.sku || undefined,
    meta: it.meta_data?.length ? { meta_data: it.meta_data } : undefined,
  }))
}

function pickCustomerName(o: WooOrder): string {
  const s = o.shipping
  const b = o.billing
  const first = s?.first_name || b?.first_name || ''
  const last  = s?.last_name  || b?.last_name  || ''
  return `${first} ${last}`.trim()
}

function pickCustomerPhone(o: WooOrder): string | null {
  return o.shipping?.phone || o.billing?.phone || null
}

function pickCustomerEmail(o: WooOrder): string | null {
  return o.billing?.email || null
}

export type SyncResult = {
  fetched: number
  inserted: number
  skipped: number
  errors: Array<{ woo_order_id: number; error: string }>
}

/**
 * Trae pedidos de Woo y hace INSERT de los que no existen.
 * No pisa pedidos existentes: una vez que un pedido esta en la DB,
 * el estado lo maneja la app, no Woo.
 */
export async function syncFromWoo(opts: {
  perPage?: number
  pages?: number
  after?: string
} = {}): Promise<SyncResult> {
  const admin = createAdminClient()
  const perPage = opts.perPage ?? 50
  const pages   = opts.pages   ?? 2
  const result: SyncResult = { fetched: 0, inserted: 0, skipped: 0, errors: [] }

  for (let page = 1; page <= pages; page++) {
    const orders = await fetchOrders({ perPage, page, after: opts.after })
    if (orders.length === 0) break
    result.fetched += orders.length

    const ids = orders.map(o => o.id)
    const { data: existing } = await admin
      .from('orders')
      .select('woo_order_id')
      .in('woo_order_id', ids)
    const existingIds = new Set((existing ?? []).map(r => r.woo_order_id))

    const toInsert = orders.filter(o => !existingIds.has(o.id))
    result.skipped += orders.length - toInsert.length

    for (const o of toInsert) {
      const row = {
        woo_order_id: o.id,
        origin: 'woo' as const,
        status: 'nuevo' as const,
        customer_name:  pickCustomerName(o) || null,
        customer_phone: pickCustomerPhone(o),
        customer_email: pickCustomerEmail(o),
        shipping_address: o.shipping ?? null,
        billing_address:  o.billing  ?? null,
        total: Number(o.total) || 0,
        payment_method: o.payment_method_title || o.payment_method || null,
        items: mapItems(o.line_items ?? []),
        notes: o.customer_note || null,
        woo_created_at: o.date_created_gmt
          ? new Date(`${o.date_created_gmt}Z`).toISOString()
          : null,
      }
      const { error } = await admin.from('orders').insert(row)
      if (error) {
        result.errors.push({ woo_order_id: o.id, error: error.message })
      } else {
        result.inserted += 1
      }
    }

    if (orders.length < perPage) break
  }

  return result
}
