import { NextResponse, type NextRequest } from 'next/server'

import { createAdminClient, createClient } from '@/lib/supabase/server'
import type { AdminRole } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const PUEDEN: AdminRole[] = ['super_admin', 'gerente']

/**
 * De qué sucursal despacha un canal (`canales_venta.sucursal_despacho_id`).
 *
 * No se puede deducir del stock (lib/pedidos/canales.ts): lo elige una
 * persona. Sin esto, los pedidos de ese canal entran sin sucursal y quedan en
 * `pedidos_sin_sucursal`. Body: { sucursal_id: uuid | null }. null la borra.
 *
 * No reasigna los pedidos que ya entraron sin sucursal: eso es otra decisión.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'sin sesión' }, { status: 401 })
  const { data: me } = await sb.from('users_admin').select('rol, activo').eq('id', user.id)
    .maybeSingle<{ rol: AdminRole; activo: boolean }>()
  if (!me?.activo || !PUEDEN.includes(me.rol)) {
    return NextResponse.json({ error: 'requiere super_admin o gerente' }, { status: 403 })
  }

  let body: { sucursal_id?: string | null }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'cuerpo inválido' }, { status: 400 }) }
  const sucursalId = body.sucursal_id ?? null
  if (sucursalId !== null && !/^[0-9a-f-]{36}$/i.test(sucursalId)) {
    return NextResponse.json({ error: 'sucursal inválida' }, { status: 400 })
  }

  const adm = createAdminClient()
  if (sucursalId) {
    const { data: suc, error: eS } = await adm.from('sucursales').select('id, activa').eq('id', sucursalId).maybeSingle()
    if (eS) return NextResponse.json({ error: eS.message }, { status: 500 })
    if (!suc?.activa) return NextResponse.json({ error: 'la sucursal no existe o no está activa' }, { status: 400 })
  }

  const { data, error } = await adm.from('canales_venta')
    .update({ sucursal_despacho_id: sucursalId }).eq('id', params.id).select('id').maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'el canal no existe' }, { status: 404 })
  return NextResponse.json({ ok: true, canal: params.id, sucursal_id: sucursalId })
}
