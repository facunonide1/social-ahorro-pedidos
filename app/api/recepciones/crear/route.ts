import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { crearRecepcion } from '@/lib/proveedores/recepcion'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const ROLES = ['super_admin', 'gerente', 'comprador', 'administrativo', 'encargado_sucursal', 'sucursal']

export async function POST(req: NextRequest) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no_autorizado' }, { status: 401 })

  const { data: perfil } = await sb
    .from('users_admin').select('rol, activo, sucursal_id').eq('id', user.id).maybeSingle()
  if (!perfil?.activo || !ROLES.includes(perfil.rol)) {
    return NextResponse.json({ error: 'sin_permiso' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'cuerpo_invalido' }, { status: 400 })

  const adm = createAdminClient()
  const { data: suc } = await adm.from('sucursales')
    .select('nombre').eq('id', body.sucursal_id).maybeSingle()

  const r = await crearRecepcion(adm, body, user.id, suc?.nombre ?? null)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
  return NextResponse.json({ ok: true, ...r.recepcion })
}
