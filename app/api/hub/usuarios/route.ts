import { NextResponse, type NextRequest } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { createAdminUser } from '@/lib/supabase/admin-users'
import type { AdminRole } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const ALL_ROLES: AdminRole[] = ['super_admin','gerente','comprador','administrativo','tesoreria','auditor','sucursal']

async function isAuthorizedSuperOrGerente() {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return null
  const { data: profile } = await sb
    .from('users_admin').select('rol, activo').eq('id', user.id).maybeSingle()
  if (!profile?.activo || !['super_admin','gerente'].includes(profile.rol)) return null
  return user
}

export async function POST(req: NextRequest) {
  const caller = await isAuthorizedSuperOrGerente()
  if (!caller) return NextResponse.json({ error: 'sin_permiso' }, { status: 403 })

  const body = await req.json().catch(() => null) as {
    email?: string; password?: string; nombre?: string; rol?: AdminRole; sucursal_id?: string | null
  } | null
  if (!body?.email || !body.password || !body.nombre || !body.rol) {
    return NextResponse.json({ error: 'email_password_nombre_rol_requeridos' }, { status: 400 })
  }
  if (!ALL_ROLES.includes(body.rol)) {
    return NextResponse.json({ error: 'rol_invalido' }, { status: 400 })
  }

  const res = await createAdminUser({
    email: body.email,
    password: body.password,
    nombre: body.nombre,
    rol: body.rol,
    sucursal_id: body.sucursal_id ?? null,
  })

  if (!res.ok) return NextResponse.json({ error: res.error, stage: res.stage }, { status: 400 })
  return NextResponse.json({ ok: true, userId: res.userId, email: res.email, rol: res.rol })
}
