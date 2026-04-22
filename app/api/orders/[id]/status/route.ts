import { NextResponse, type NextRequest } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { mapStatusToWoo, updateWooOrderStatus } from '@/lib/woo/client'
import { messageForStatus, normalizePhoneForWhatsApp } from '@/lib/whatsapp/messages'
import { formatOrderNumber } from '@/lib/orders/format'
import type { OrderStatus } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Cambia el status de un pedido:
 *  1. Vía RPC set_order_status (respeta RLS y la validación de rol).
 *  2. Si es pedido Woo, best-effort PUT a Woo con el estado mapeado.
 *     Guarda el resultado en woo_last_sync_* para diagnóstico.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no_autorizado' }, { status: 401 })

  const body = await req.json().catch(() => null) as {
    status?: OrderStatus
    note?: string | null
  } | null
  if (!body?.status) {
    return NextResponse.json({ error: 'status_requerido' }, { status: 400 })
  }

  // 1) RPC: cambia status en Supabase
  const { data: updated, error } = await sb.rpc('set_order_status', {
    p_order_id: params.id,
    p_status: body.status,
    p_note: body.note ?? null,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const order = Array.isArray(updated) ? updated[0] : updated

  // 2) Generar mensaje de WhatsApp pendiente para el nuevo estado.
  //    Queda guardado aunque no haya teléfono (el operador decide si
  //    despacharlo o marcarlo como omitido). Si el insert falla, lo
  //    logueamos y lo reportamos en la response (no bloquea el cambio
  //    de estado, que ya se guardó en el paso 1).
  let whatsappMsg: { ok: true; id: string } | { ok: false; error: string } | null = null
  if (order) {
    const phone = normalizePhoneForWhatsApp(order.customer_phone)
    const text = messageForStatus(body.status, {
      customerName: order.customer_name,
      orderNumber: formatOrderNumber(order),
    })
    const { data: msgRow, error: msgErr } = await createAdminClient()
      .from('whatsapp_messages')
      .insert({
        order_id: order.id,
        status_trigger: body.status,
        phone,
        message: text,
        status: 'pending',
      })
      .select('id')
      .maybeSingle()
    if (msgErr) {
      console.error('[whatsapp_messages insert]', msgErr)
      whatsappMsg = { ok: false, error: msgErr.message }
    } else if (msgRow) {
      whatsappMsg = { ok: true, id: msgRow.id }
    }
  }

  // 3) Best-effort sync a Woo (solo pedidos de origen 'woo')
  let woo: { ok: true; status: string } | { ok: false; error: string } | null = null
  if (order?.origin === 'woo' && order.woo_order_id) {
    const target = mapStatusToWoo(body.status)
    try {
      await updateWooOrderStatus(order.woo_order_id, target)
      woo = { ok: true, status: target }
      await createAdminClient()
        .from('orders')
        .update({
          woo_last_sync_status: target,
          woo_last_sync_at: new Date().toISOString(),
          woo_last_sync_error: null,
        })
        .eq('id', order.id)
    } catch (e: any) {
      const msg = e?.message ?? 'error_desconocido'
      woo = { ok: false, error: msg }
      await createAdminClient()
        .from('orders')
        .update({
          woo_last_sync_at: new Date().toISOString(),
          woo_last_sync_error: msg,
        })
        .eq('id', order.id)
    }
  }

  return NextResponse.json({ ok: true, order, woo, whatsappMsg })
}
