import { NextResponse, type NextRequest } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { UserRole } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type CreateBody = {
  email?: string
  password?: string
  name?: string
  role?: UserRole
}

/**
 * Crea un usuario del CRM:
 *  1. Crea el usuario en auth.users (service role).
 *  2. Crea la fila en public.users_pedidos con el id, nombre y rol.
 *
 * Sólo admin puede usarlo.
 */
export async function POST(req: NextRequest) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no_autorizado' }, { status: 401 })

  const { data: profile } = await sb
    .from('users_pedidos').select('role, active').eq('id', user.id).maybeSingle()

  if (!profile?.active || profile.role !== 'admin') {
    return NextResponse.json({ error: 'sin_permiso' }, { status: 403 })
  }

  const body = (await req.json().catch(() => null)) as CreateBody | null
  const email = body?.email?.trim().toLowerCase()
  const password = body?.password
  const name = body?.name?.trim() || null
  const role = body?.role

  if (!email || !password || !role) {
    return NextResponse.json({ error: 'email_password_role_requeridos' }, { status: 400 })
  }
  if (password.length < 6) {
    return NextResponse.json({ error: 'password_min_6' }, { status: 400 })
  }
  if (!['admin','operador','repartidor'].includes(role)) {
    return NextResponse.json({ error: 'role_invalido' }, { status: 400 })
  }

  const admin = createAdminClient()

  // 1) Crear auth user (ya confirmado, sin mail)
  const { data: created, error: authErr } = await admin.auth.admin.createUser({
    email, password,
    email_confirm: true,
  })
  if (authErr || !created?.user) {
    return NextResponse.json({ error: authErr?.message || 'auth_create_failed' }, { status: 400 })
  }

  // 2) Fila en users_pedidos
  const { error: rowErr, data: row } = await admin
    .from('users_pedidos')
    .insert({
      id: created.user.id,
      email,
      name,
      role,
      active: true,
    })
    .select('*')
    .maybeSingle()

  if (rowErr) {
    // Rollback: borrar el auth user si falló la fila de profile
    await admin.auth.admin.deleteUser(created.user.id).catch(() => {})
    return NextResponse.json({ error: rowErr.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true, user: row })
}
