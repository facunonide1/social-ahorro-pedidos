import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { AdminRole } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Atender / descartar una alerta de stock (OPS · T8). */
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
  const { id, accion } = body
  if (!id || !['atender', 'descartar'].includes(accion)) return NextResponse.json({ error: 'datos inválidos' }, { status: 400 })

  const adm = createAdminClient()
  const { error } = await adm.from('alertas_stock').update({
    estado: accion === 'atender' ? 'atendida' : 'descartada', atendida_por: user.id,
  }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
