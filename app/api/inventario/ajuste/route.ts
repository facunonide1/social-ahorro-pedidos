import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { AdminRole } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Ajuste manual de stock (OPS · T5): inserta un movimiento firmado. */
export async function POST(req: NextRequest) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no autenticado' }, { status: 401 })
  const { data: me } = await sb.from('users_admin').select('rol, activo').eq('id', user.id)
    .maybeSingle<{ rol: AdminRole; activo: boolean }>()
  if (!me || !me.activo || !['super_admin', 'gerente', 'comprador', 'administrativo'].includes(me.rol)) {
    return NextResponse.json({ error: 'sin permiso' }, { status: 403 })
  }

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'body inválido' }, { status: 400 }) }
  const { producto_id, sucursal_id } = body
  const delta = Number(body?.delta)
  const motivo = String(body?.motivo ?? '').trim()
  if (!producto_id || !sucursal_id || !Number.isFinite(delta) || delta === 0) {
    return NextResponse.json({ error: 'producto, sucursal y delta (≠0) requeridos' }, { status: 400 })
  }
  if (motivo.length < 3) return NextResponse.json({ error: 'el motivo es obligatorio' }, { status: 400 })

  const adm = createAdminClient()
  const { error } = await adm.from('movimientos_stock').insert({
    producto_id, sucursal_id,
    tipo: delta > 0 ? 'ajuste_pos' : 'ajuste_neg',
    cantidad: delta, motivo, referencia_tipo: 'ajuste_manual',
    fecha: new Date().toISOString(), created_by: user.id,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
