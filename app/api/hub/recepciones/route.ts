import { NextResponse, type NextRequest } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { RecepcionEstado } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type ItemInput = {
  descripcion: string
  cantidad_pedida?: number | null
  cantidad_recibida?: number | null
  cantidad_danada?: number | null
  fecha_vencimiento_producto?: string | null
  observaciones?: string | null
}

/**
 * Calcula el estado a partir de los items:
 *  - rechazada: ningún item recibido
 *  - completa: todos los items recibidos = pedidos y sin dañados
 *  - parcial: algún item recibido < pedido (sin dañados)
 *  - con_diferencias: hay items dañados o sobrantes (recibido > pedido)
 */
function calcularEstado(items: ItemInput[]): RecepcionEstado {
  if (items.length === 0) return 'completa'
  let totalPedido = 0
  let totalRecibido = 0
  let totalDanado = 0
  let huboSobrante = false

  for (const it of items) {
    const ped = Number(it.cantidad_pedida ?? 0)
    const rec = Number(it.cantidad_recibida ?? 0)
    const dan = Number(it.cantidad_danada ?? 0)
    totalPedido   += ped
    totalRecibido += rec
    totalDanado   += dan
    if (ped > 0 && rec > ped) huboSobrante = true
  }

  if (totalRecibido === 0 && totalPedido > 0) return 'rechazada'
  if (totalDanado > 0 || huboSobrante) return 'con_diferencias'
  if (totalPedido > 0 && totalRecibido < totalPedido) return 'parcial'
  return 'completa'
}

/**
 * Body:
 * {
 *   sucursal_id, order_id?, numero_remito, fecha_recepcion (ISO),
 *   observaciones, items: [{ descripcion, cantidad_pedida, cantidad_recibida, cantidad_danada, fecha_vencimiento_producto, observaciones }]
 * }
 * Estado se calcula automáticamente a partir de los items.
 */
export async function POST(req: NextRequest) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no_autorizado' }, { status: 401 })

  const { data: profile } = await sb
    .from('users_admin').select('rol, activo, sucursal_id').eq('id', user.id).maybeSingle()
  if (!profile?.activo || !['super_admin','gerente','administrativo','sucursal'].includes(profile.rol)) {
    return NextResponse.json({ error: 'sin_permiso' }, { status: 403 })
  }

  const body = await req.json().catch(() => null) as {
    sucursal_id?: string | null
    order_id?: string | null
    numero_remito?: string | null
    fecha_recepcion?: string | null
    observaciones?: string | null
    items?: ItemInput[]
  } | null

  if (!body) return NextResponse.json({ error: 'body_invalido' }, { status: 400 })

  // Si rol sucursal, sólo puede usar su propia sucursal
  let sucursalId = body.sucursal_id || null
  if (profile.rol === 'sucursal') {
    if (!profile.sucursal_id) return NextResponse.json({ error: 'sin_sucursal_asignada' }, { status: 403 })
    sucursalId = profile.sucursal_id
  }

  const items = (body.items ?? []).filter(it => (it.descripcion || '').trim().length > 0)
  const estado = calcularEstado(items)

  const admin = createAdminClient()
  const { data: recRow, error: recErr } = await admin
    .from('recepciones_mercaderia').insert({
      order_id:        body.order_id || null,
      sucursal_id:     sucursalId,
      numero_remito:   body.numero_remito?.trim() || null,
      fecha_recepcion: body.fecha_recepcion || new Date().toISOString(),
      estado,
      observaciones:   body.observaciones?.trim() || null,
      recibido_por:    user.id,
    })
    .select('id')
    .maybeSingle()

  if (recErr || !recRow) {
    return NextResponse.json({ error: recErr?.message ?? 'recepcion_insert_failed' }, { status: 500 })
  }

  if (items.length > 0) {
    const itemsPayload = items.map(it => ({
      recepcion_id:               recRow.id,
      descripcion:                it.descripcion.trim(),
      cantidad_pedida:            it.cantidad_pedida ?? null,
      cantidad_recibida:          it.cantidad_recibida ?? null,
      cantidad_danada:            it.cantidad_danada ?? 0,
      fecha_vencimiento_producto: it.fecha_vencimiento_producto || null,
      observaciones:              it.observaciones?.trim() || null,
    }))
    const { error: itErr } = await admin.from('recepcion_items').insert(itemsPayload)
    if (itErr) {
      await admin.from('recepciones_mercaderia').delete().eq('id', recRow.id)
      return NextResponse.json({ error: itErr.message }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true, recepcionId: recRow.id, estado })
}
