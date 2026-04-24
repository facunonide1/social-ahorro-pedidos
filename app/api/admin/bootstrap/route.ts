import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { createAdminUser } from '@/lib/supabase/admin-users'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Endpoint de bootstrap para crear el PRIMER super_admin del Admin Hub.
 *
 * GET  → devuelve { bootstrapped: boolean }. Si ya hay al menos un
 *        super_admin en users_admin, bootstrapped: true. Sólo se
 *        puede bootstrappear una vez.
 * POST → body { email, password, nombre }. Crea el super_admin si
 *        todavía no hay ninguno. 409 si ya existe.
 *
 * No requiere auth (es pre-setup). Una vez que hay al menos un
 * super_admin, responde 409 a cualquier intento posterior.
 */

async function countSuperAdmins(): Promise<number | null> {
  const admin = createAdminClient()
  const { count, error } = await admin
    .from('users_admin')
    .select('*', { count: 'exact', head: true })
    .eq('rol', 'super_admin')
    .eq('activo', true)
  if (error) return null
  return count ?? 0
}

export async function GET() {
  const c = await countSuperAdmins()
  if (c === null) {
    return NextResponse.json({
      bootstrapped: false,
      error: 'users_admin_no_existe_o_sin_acceso',
      hint: 'Aplicá primero las migraciones 0017 y 0016 en Supabase.',
    }, { status: 503 })
  }
  return NextResponse.json({ bootstrapped: c > 0, count: c })
}

export async function POST(req: NextRequest) {
  const existing = await countSuperAdmins()
  if (existing === null) {
    return NextResponse.json({
      ok: false,
      error: 'users_admin_no_existe_o_sin_acceso',
      hint: 'Aplicá primero las migraciones 0017 y 0016 en Supabase.',
    }, { status: 503 })
  }
  if (existing > 0) {
    return NextResponse.json({
      ok: false,
      error: 'ya_existe_super_admin',
      hint: 'El bootstrap ya se usó. Para agregar más admins, entrá con un super_admin existente.',
    }, { status: 409 })
  }

  const body = await req.json().catch(() => null) as {
    email?: string; password?: string; nombre?: string
  } | null

  if (!body?.email || !body.password || !body.nombre) {
    return NextResponse.json({ ok: false, error: 'email_password_nombre_requeridos' }, { status: 400 })
  }

  const res = await createAdminUser({
    email: body.email,
    password: body.password,
    nombre: body.nombre,
    rol: 'super_admin',
  })

  if (!res.ok) {
    return NextResponse.json({ ok: false, error: res.error, stage: res.stage }, { status: 400 })
  }

  return NextResponse.json({ ok: true, userId: res.userId, email: res.email })
}
