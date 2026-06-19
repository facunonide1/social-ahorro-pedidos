import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { AdminRole } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Reposición interna depósito → góndola (misma sucursal) (v0.20).
 * Inserta 2 movimientos firmados: −cantidad en depósito y +cantidad en góndola.
 * El stock total no cambia; solo se traslada entre ubicaciones.
 */
export async function POST(req: NextRequest) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no autenticado' }, { status: 401 })
  const { data: me } = await sb.from('users_admin').select('rol, activo').eq('id', user.id)
    .maybeSingle<{ rol: AdminRole; activo: boolean }>()
  if (!me || !me.activo || !['super_admin', 'gerente', 'comprador', 'administrativo', 'sucursal'].includes(me.rol)) {
    return NextResponse.json({ error: 'sin permiso' }, { status: 403 })
  }

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'body inválido' }, { status: 400 }) }
  const { producto_id, sucursal_id } = body
  const cantidad = Number(body?.cantidad)
  if (!producto_id || !sucursal_id || !Number.isFinite(cantidad) || cantidad <= 0) {
    return NextResponse.json({ error: 'producto, sucursal y cantidad (>0) requeridos' }, { status: 400 })
  }

  const adm = createAdminClient()
  // Validar que haya suficiente en depósito.
  const { data: item } = await adm.from('stock_items')
    .select('cantidad_deposito').eq('producto_id', producto_id).eq('sucursal_id', sucursal_id).maybeSingle()
  if (!item || Number(item.cantidad_deposito) < cantidad) {
    return NextResponse.json({ error: `Depósito insuficiente (hay ${Number(item?.cantidad_deposito ?? 0)}).` }, { status: 422 })
  }

  const fecha = new Date().toISOString()
  const base = { producto_id, sucursal_id, tipo: 'reposicion_interna' as const, referencia_tipo: 'manual' as const, motivo: 'Reposición góndola desde depósito', fecha, created_by: user.id }
  const { error } = await adm.from('movimientos_stock').insert([
    { ...base, cantidad: -cantidad, ubicacion: 'deposito' },
    { ...base, cantidad: cantidad, ubicacion: 'gondola' },
  ])
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
