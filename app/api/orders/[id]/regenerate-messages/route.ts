import { NextResponse, type NextRequest } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { messageForStatus, normalizePhoneForWhatsApp } from '@/lib/whatsapp/messages'
import { formatOrderNumber } from '@/lib/orders/format'
import type { Order, OrderStatus, OrderStatusHistory } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Reconstruye mensajes de WhatsApp pendientes a partir del historial
 * del pedido, para recuperar notificaciones que no se generaron
 * cuando ocurrió el cambio de estado (por ejemplo, si el pedido
 * cambió antes de aplicar la migración 0012).
 *
 * Mantiene idempotencia: por cada entry del historial, sólo crea el
 * mensaje si todavía no existe uno con el mismo status_trigger y
 * (aproximadamente) el mismo created_at.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no_autorizado' }, { status: 401 })

  const { data: profile } = await sb
    .from('users_pedidos').select('role, active').eq('id', user.id).maybeSingle()
  if (!profile?.active || !['admin','operador'].includes(profile.role)) {
    return NextResponse.json({ error: 'sin_permiso' }, { status: 403 })
  }

  const { data: order, error: orderErr } = await sb
    .from('orders').select('*').eq('id', params.id).maybeSingle<Order>()
  if (orderErr) return NextResponse.json({ error: orderErr.message }, { status: 400 })
  if (!order)   return NextResponse.json({ error: 'pedido_no_encontrado' }, { status: 404 })

  const { data: history } = await sb
    .from('order_status_history')
    .select('*')
    .eq('order_id', order.id)
    .order('created_at', { ascending: true })
    .returns<OrderStatusHistory[]>()

  const admin = createAdminClient()

  // Probe: ¿existe la tabla?
  const probe = await admin.from('whatsapp_messages').select('id').limit(1)
  if (probe.error) {
    const msg = probe.error.message || ''
    if (msg.includes('does not exist') || (probe.error as any).code === '42P01') {
      return NextResponse.json({
        error: 'tabla_whatsapp_messages_no_existe',
        hint: 'Falta aplicar la migración 0012_whatsapp_messages.sql en Supabase. Corré el SQL y volvé a probar.',
      }, { status: 500 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  // Mensajes ya existentes, por status_trigger
  const { data: existing } = await admin
    .from('whatsapp_messages')
    .select('status_trigger, created_at')
    .eq('order_id', order.id)

  const existingKeys = new Set(
    (existing ?? []).map(m => `${m.status_trigger}|${new Date(m.created_at as string).getTime()}`)
  )

  const phone = normalizePhoneForWhatsApp(order.customer_phone)
  const orderNumber = formatOrderNumber(order)

  let created = 0
  const errors: string[] = []

  for (const h of history ?? []) {
    // Dedupe aproximado: si ya hay un mensaje para el mismo status en una
    // ventana ±5 segundos del timestamp del history, lo salteamos.
    const t = new Date(h.created_at).getTime()
    const nearby = Array.from(existingKeys).some(k => {
      const [st, ts] = k.split('|')
      return st === h.status && Math.abs(Number(ts) - t) < 5000
    })
    if (nearby) continue

    const text = messageForStatus(h.status as OrderStatus, {
      customerName: order.customer_name,
      orderNumber,
    })
    const { error: insErr } = await admin.from('whatsapp_messages').insert({
      order_id: order.id,
      status_trigger: h.status,
      phone,
      message: text,
      status: 'pending',
      created_at: h.created_at, // preservamos el timestamp del cambio original
    })
    if (insErr) {
      errors.push(insErr.message)
    } else {
      created += 1
      existingKeys.add(`${h.status}|${t}`)
    }
  }

  return NextResponse.json({ ok: true, created, errors })
}
