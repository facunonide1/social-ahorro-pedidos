import { NextResponse, type NextRequest } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { AdminRole } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const ALL_ROLES: AdminRole[] = ['super_admin','gerente','comprador','administrativo','tesoreria','auditor','sucursal']

async function authorize() {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return null
  const { data: profile } = await sb
    .from('users_admin').select('rol, activo').eq('id', user.id).maybeSingle()
  if (!profile?.activo || !['super_admin','gerente'].includes(profile.rol)) return null
  return { id: user.id }
}

/**
 * PATCH: actualiza rol / sucursal_id / activo del admin.
 * El trigger users_admin_lock_self impide que el admin se modifique a sí mismo.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const caller = await authorize()
  if (!caller) return NextResponse.json({ error: 'sin_permiso' }, { status: 403 })

  const body = await req.json().catch(() => null) as {
    rol?: AdminRole; sucursal_id?: string | null; activo?: boolean
  } | null
  if (!body) return NextResponse.json({ error: 'body_requerido' }, { status: 400 })

  const patch: Record<string, unknown> = {}
  if (body.rol !== undefined) {
    if (!ALL_ROLES.includes(body.rol)) return NextResponse.json({ error: 'rol_invalido' }, { status: 400 })
    patch.rol = body.rol
  }
  if (body.sucursal_id !== undefined) patch.sucursal_id = body.sucursal_id
  if (body.activo !== undefined) patch.activo = body.activo

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'sin_cambios' }, { status: 400 })
  }

  // Usamos admin client para no chocar con trigger lock_self (que mira auth.uid).
  // Igual el endpoint protege contra autoedición:
  if (params.id === caller.id) {
    return NextResponse.json({ error: 'no_podes_modificarte_a_vos_mismo' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('users_admin').update(patch).eq('id', params.id).select('*').maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true, user: data })
}

/**
 * DELETE: elimina del auth.users (cascadea users_admin).
 * Reservar para casos puntuales; preferir desactivar.
 */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const caller = await authorize()
  if (!caller) return NextResponse.json({ error: 'sin_permiso' }, { status: 403 })

  if (params.id === caller.id) {
    return NextResponse.json({ error: 'no_podes_borrarte_a_vos_mismo' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin.auth.admin.deleteUser(params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
