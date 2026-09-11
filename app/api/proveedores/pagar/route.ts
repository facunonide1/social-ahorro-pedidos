import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { registrarPago } from '@/lib/proveedores/pagos'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Quién puede PEDIR un pago. Aprobarlo es otra cosa y la hace el dueño. */
const ROLES = ['super_admin', 'gerente', 'tesoreria', 'administrativo']

export async function POST(req: NextRequest) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no_autorizado' }, { status: 401 })

  const { data: perfil } = await sb
    .from('users_admin').select('rol, activo').eq('id', user.id).maybeSingle()
  if (!perfil?.activo || !ROLES.includes(perfil.rol)) {
    return NextResponse.json({ error: 'sin_permiso' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'cuerpo_invalido' }, { status: 400 })

  const r = await registrarPago(createAdminClient(), body, user.id)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
  return NextResponse.json({ ok: true, ...r.pago })
}
