import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { AdminRole } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const ROLES: AdminRole[] = ['super_admin', 'gerente', 'comprador', 'administrativo']
const RUBROS = ['farmacia', 'perfumeria', 'supermercado', 'servicios']

/**
 * Comparador → orden (OS-4a · C): agrega un producto a una orden BORRADOR del
 * proveedor ganador (crea la orden si no existe una borrador de ese
 * proveedor+rubro; si existe, suma el ítem). Devuelve el resumen del "carrito".
 */
export async function POST(req: NextRequest) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no autenticado' }, { status: 401 })
  const { data: me } = await sb.from('users_admin').select('rol, activo').eq('id', user.id).maybeSingle<{ rol: AdminRole; activo: boolean }>()
  if (!me?.activo || !ROLES.includes(me.rol)) return NextResponse.json({ error: 'sin permiso' }, { status: 403 })

  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'body inválido' }, { status: 400 }) }
  if (!b?.producto_id || !b?.proveedor_id) return NextResponse.json({ error: 'producto y proveedor requeridos' }, { status: 400 })

  const adm = createAdminClient()
  const rubro = RUBROS.includes(b?.rubro) ? b.rubro : 'farmacia'
  const precio = Number(b?.precio) > 0 ? Number(b.precio) : null

  // Orden borrador del proveedor+rubro (la reutiliza si ya existe).
  let ordenId: string | null = null
  const { data: existente } = await adm.from('ordenes_compra')
    .select('id').eq('proveedor_id', b.proveedor_id).eq('rubro', rubro).eq('estado', 'borrador')
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  ordenId = existente?.id ?? null
  if (!ordenId) {
    const { data: nueva, error } = await adm.from('ordenes_compra').insert({
      proveedor_id: b.proveedor_id, rubro, estado: 'borrador', origen: 'manual', created_by: user.id,
    }).select('id').single()
    if (error || !nueva) return NextResponse.json({ error: error?.message ?? 'no se pudo crear la orden' }, { status: 400 })
    ordenId = nueva.id
  }

  // Ítem: si ya está en la orden, +1; si no, lo agrega.
  const { data: item } = await adm.from('orden_compra_items').select('id, cantidad_total').eq('orden_id', ordenId).eq('producto_id', b.producto_id).maybeSingle()
  if (item) {
    await adm.from('orden_compra_items').update({ cantidad_total: Number(item.cantidad_total ?? 0) + 1 }).eq('id', item.id)
  } else {
    await adm.from('orden_compra_items').insert({ orden_id: ordenId, producto_id: b.producto_id, descripcion: b?.nombre ?? null, cantidad_total: 1, costo_unitario: precio })
  }

  // Resumen del carrito: órdenes borrador + total de ítems.
  const { data: borradores } = await adm.from('ordenes_compra').select('id').eq('estado', 'borrador')
  const bIds = ((borradores ?? []) as any[]).map((o) => o.id)
  let items = 0
  if (bIds.length) {
    const { count } = await adm.from('orden_compra_items').select('id', { count: 'exact', head: true }).in('orden_id', bIds)
    items = count ?? 0
  }
  return NextResponse.json({ ok: true, orden_id: ordenId, ordenes: bIds.length, items })
}
