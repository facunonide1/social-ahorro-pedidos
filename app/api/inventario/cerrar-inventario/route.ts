import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { AdminRole } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Cierra un inventario físico ajustando stock vía movimientos `conteo` (OPS · T11).
 * delta = stock_contado − stock_sistema → trigger movimientos_stock_aplicar
 * actualiza stock_items. Reemplaza la RPC vieja (que tocaba stock_sucursal).
 */
export async function POST(req: NextRequest) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no autenticado' }, { status: 401 })
  const { data: me } = await sb.from('users_admin').select('rol, activo').eq('id', user.id).maybeSingle<{ rol: AdminRole; activo: boolean }>()
  if (!me || !me.activo || !['super_admin', 'gerente', 'administrativo', 'sucursal'].includes(me.rol)) {
    return NextResponse.json({ error: 'sin permiso' }, { status: 403 })
  }
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'body inválido' }, { status: 400 }) }
  const inventarioId = body?.inventario_id
  if (!inventarioId) return NextResponse.json({ error: 'inventario_id requerido' }, { status: 400 })

  const adm = createAdminClient()
  const { data: inv } = await adm.from('inventarios_fisicos').select('id, sucursal_id, estado').eq('id', inventarioId).maybeSingle<any>()
  if (!inv) return NextResponse.json({ error: 'inventario no encontrado' }, { status: 404 })
  if (inv.estado === 'cerrado') return NextResponse.json({ error: 'el inventario ya está cerrado' }, { status: 400 })

  const { data: items } = await adm.from('inventario_items').select('id, producto_id, stock_sistema, stock_contado').eq('inventario_id', inventarioId)
  const its = ((items ?? []) as any[]).filter((i) => i.stock_contado != null)

  let dif = 0
  const now = new Date().toISOString()
  for (const it of its) {
    const delta = Number(it.stock_contado) - Number(it.stock_sistema)
    await adm.from('inventario_items').update({ diferencia: delta }).eq('id', it.id)
    if (delta !== 0) {
      dif++
      await adm.from('movimientos_stock').insert({
        producto_id: it.producto_id, sucursal_id: inv.sucursal_id, tipo: 'conteo',
        cantidad: delta, motivo: 'Ajuste por inventario físico', referencia_tipo: 'inventario', referencia_id: inventarioId,
        fecha: now, created_by: user.id,
      })
    }
  }

  await adm.from('inventarios_fisicos').update({
    estado: 'cerrado', closed_at: now, total_items_contados: its.length, diferencias_detectadas: dif,
  }).eq('id', inventarioId)

  return NextResponse.json({ ok: true, contados: its.length, diferencias: dif })
}
