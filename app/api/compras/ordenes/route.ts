import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { AdminRole } from '@/lib/types/admin'
import { normalizarOrden } from '@/lib/compras/procesar-orden'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

async function gate() {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: 'no autenticado', status: 401 as const }
  const { data: me } = await sb.from('users_admin').select('rol, activo').eq('id', user.id).maybeSingle<{ rol: AdminRole; activo: boolean }>()
  if (!me || !me.activo || !['super_admin', 'gerente', 'comprador'].includes(me.rol)) return { error: 'sin permiso', status: 403 as const }
  return { ok: true as const, userId: user.id }
}

/** Crear orden de compra (con distribución por sucursal) o cambiar estado. */
export async function POST(req: NextRequest) {
  const g = await gate()
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })

  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'body inválido' }, { status: 400 }) }
  const adm = createAdminClient()

  // Cambio de estado
  if (b?.action === 'estado') {
    if (!b.id || !b.estado) return NextResponse.json({ error: 'id y estado requeridos' }, { status: 400 })
    const { error } = await adm.from('ordenes_compra').update({ estado: b.estado, updated_at: new Date().toISOString() }).eq('id', b.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  // Crear
  if (!b?.proveedor_id) return NextResponse.json({ error: 'proveedor requerido' }, { status: 400 })
  if (!b?.sucursal_compradora_id) return NextResponse.json({ error: 'sucursal compradora requerida' }, { status: 400 })
  const { items, totalEstimado } = normalizarOrden(Array.isArray(b?.items) ? b.items : [])
  if (!items.length) return NextResponse.json({ error: 'agregá al menos un ítem con cantidad' }, { status: 400 })

  const { data: orden, error: eOrden } = await adm.from('ordenes_compra').insert({
    proveedor_id: b.proveedor_id,
    rubro: b?.rubro ?? 'farmacia',
    sucursal_compradora_id: b.sucursal_compradora_id,
    estado: b?.estado ?? 'borrador',
    origen: b?.origen ?? 'manual',
    total_estimado: totalEstimado,
    condicion_pago: b?.condicion_pago ?? null,
    notas: b?.notas ?? null,
    created_by: g.userId,
  }).select('id, codigo').single()
  if (eOrden) return NextResponse.json({ error: eOrden.message }, { status: 400 })

  const { error: eItems } = await adm.from('orden_compra_items').insert(items.map((it) => ({
    orden_id: orden.id, producto_id: it.producto_id, descripcion: it.descripcion,
    cantidad_total: it.cantidad_total, costo_unitario: it.costo_unitario,
    distribucion: it.distribucion, origen_aviso_id: it.origen_aviso_id,
  })))
  if (eItems) return NextResponse.json({ error: eItems.message }, { status: 400 })

  // Avisos de faltante → en_orden
  const avisoIds = [...new Set(items.map((it) => it.origen_aviso_id).filter(Boolean) as string[])]
  if (avisoIds.length) await adm.from('avisos_faltante').update({ estado: 'en_orden', orden_id: orden.id }).in('id', avisoIds)

  return NextResponse.json({ ok: true, id: orden.id, codigo: orden.codigo })
}
