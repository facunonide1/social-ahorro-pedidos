import { NextResponse, type NextRequest } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { mapStatusToWoo, updateWooOrderStatus } from '@/lib/woo/client'
import type { OrderStatus } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Reintenta empujar el estado actual del pedido a Woo (best-effort).
 * Sirve cuando la sync falló en el cambio anterior y el operador quiere
 * forzar el reenvío sin volver a tocar el estado.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no_autorizado' }, { status: 401 })

  const { data: profile } = await sb
    .from('users_pedidos')
    .select('role, active')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.active || !['admin', 'operador'].includes(profile.role)) {
    return NextResponse.json({ error: 'sin_permiso' }, { status: 403 })
  }

  const { data: order, error } = await sb
    .from('orders')
    .select('id, origin, woo_order_id, status')
    .eq('id', params.id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!order) return NextResponse.json({ error: 'pedido_no_encontrado' }, { status: 404 })
  if (order.origin !== 'woo' || !order.woo_order_id) {
    return NextResponse.json({ error: 'pedido_no_woo' }, { status: 400 })
  }

  const target = mapStatusToWoo(order.status as OrderStatus)
  try {
    await updateWooOrderStatus(order.woo_order_id, target)
    await createAdminClient()
      .from('orders')
      .update({
        woo_last_sync_status: target,
        woo_last_sync_at: new Date().toISOString(),
        woo_last_sync_error: null,
      })
      .eq('id', order.id)
    return NextResponse.json({ ok: true, status: target })
  } catch (e: any) {
    const msg = e?.message ?? 'error_desconocido'
    await createAdminClient()
      .from('orders')
      .update({
        woo_last_sync_at: new Date().toISOString(),
        woo_last_sync_error: msg,
      })
      .eq('id', order.id)
    return NextResponse.json({ ok: false, error: msg }, { status: 502 })
  }
}
