import { createAdminClient } from '@/lib/supabase/server'
import { fetchOrders, type WooOrder } from './client'
import { fueraDeHorario as isFueraDeHorario, mapearItems as mapItems, tipoEnvio as pickTipoEnvio } from './mapear'

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

  // Cargamos los horarios configurados una sola vez por corrida.
  const { data: settings } = await admin
    .from('app_settings')
    .select('hora_apertura, hora_cierre')
    .eq('id', 1)
    .maybeSingle()
  const horaApertura = settings?.hora_apertura ?? 8
  const horaCierre   = settings?.hora_cierre   ?? 20

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
      const wooCreated = o.date_created_gmt
        ? new Date(`${o.date_created_gmt}Z`).toISOString()
        : null
      const name  = pickCustomerName(o) || null
      const phone = pickCustomerPhone(o)
      const email = pickCustomerEmail(o)?.toLowerCase() ?? null
      const shipping = o.shipping ?? null
      const billing  = o.billing  ?? null

      // Match/crea customer
      let customerId: string | null = null
      if (phone) {
        const { data } = await admin.from('customers').select('id').eq('phone', phone).limit(1).maybeSingle()
        if (data) customerId = data.id
      }
      if (!customerId && email) {
        const { data } = await admin.from('customers').select('id').eq('email', email).limit(1).maybeSingle()
        if (data) customerId = data.id
      }
      if (!customerId) {
        const { data: created } = await admin
          .from('customers')
          .insert({ name, phone, email, address: shipping || billing })
          .select('id').maybeSingle()
        customerId = created?.id ?? null
      }
      // Si el customer ya existe no sobreescribo sus datos (pueden haberlos
      // editado a mano). Los operadores pueden actualizar desde /clientes.

      const row = {
        woo_order_id: o.id,
        origin: 'woo' as const,
        tipo_envio: pickTipoEnvio(o),
        fuera_de_horario: isFueraDeHorario(wooCreated, horaApertura, horaCierre),
        status: 'nuevo' as const,
        customer_id:     customerId,
        customer_name:   name,
        customer_phone:  phone,
        customer_email:  email,
        shipping_address: shipping,
        billing_address:  billing,
        total: Number(o.total) || 0,
        payment_method: o.payment_method_title || o.payment_method || null,
        items: mapItems(o.line_items ?? []),
        notes: o.customer_note || null,
        woo_created_at: wooCreated,
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
