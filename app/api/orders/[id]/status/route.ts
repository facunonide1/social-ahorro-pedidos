import { NextResponse, type NextRequest } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { mapStatusToWoo, updateWooOrderStatus } from '@/lib/woo/client'
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

  // 2) Best-effort sync a Woo (solo pedidos de origen 'woo')
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

  return NextResponse.json({ ok: true, order, woo })
}
