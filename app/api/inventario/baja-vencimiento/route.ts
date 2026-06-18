import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { AdminRole } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Da de baja un lote vencido: movimiento baja_vencimiento + marca el lote. (OPS · T9) */
export async function POST(req: NextRequest) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no autenticado' }, { status: 401 })
  const { data: me } = await sb.from('users_admin').select('rol, activo').eq('id', user.id).maybeSingle<{ rol: AdminRole; activo: boolean }>()
  if (!me || !me.activo || !['super_admin', 'gerente', 'comprador', 'administrativo', 'sucursal'].includes(me.rol)) {
    return NextResponse.json({ error: 'sin permiso' }, { status: 403 })
  }
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'body inválido' }, { status: 400 }) }

  const adm = createAdminClient()
  // body.lote_ids: string[] (dar de baja varios) o body.lote_id
  const ids: string[] = Array.isArray(body?.lote_ids) ? body.lote_ids : body?.lote_id ? [body.lote_id] : []
  if (ids.length === 0) return NextResponse.json({ error: 'lote_id requerido' }, { status: 400 })

  const { data: lotes } = await adm.from('lotes_productos').select('id, producto_id, sucursal_id, cantidad_actual, costo_unitario, numero_lote').in('id', ids)
  let bajas = 0
  for (const l of (lotes ?? []) as any[]) {
    const cant = Number(l.cantidad_actual)
    if (cant <= 0) continue
    const { error } = await adm.from('movimientos_stock').insert({
      producto_id: l.producto_id, sucursal_id: l.sucursal_id, tipo: 'baja_vencimiento',
      cantidad: -cant, motivo: `Baja por vencimiento (lote ${l.numero_lote ?? 's/n'})`,
      costo_unitario: l.costo_unitario, referencia_tipo: 'lote', referencia_id: l.id,
      fecha: new Date().toISOString(), created_by: user.id,
    })
    if (error) continue
    await adm.from('lotes_productos').update({ cantidad_actual: 0, estado: 'vencido' }).eq('id', l.id)
    bajas++
  }
  return NextResponse.json({ ok: true, bajas })
}
