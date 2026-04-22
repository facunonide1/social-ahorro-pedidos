import { NextResponse, type NextRequest } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Elimina un usuario del CRM. Borra de auth.users y por cascada
 * también la fila en public.users_pedidos.
 * Sólo admin. Un admin no puede eliminarse a sí mismo (evita lockout).
 */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no_autorizado' }, { status: 401 })

  const { data: profile } = await sb
    .from('users_pedidos').select('role, active').eq('id', user.id).maybeSingle()

  if (!profile?.active || profile.role !== 'admin') {
    return NextResponse.json({ error: 'sin_permiso' }, { status: 403 })
  }

  if (params.id === user.id) {
    return NextResponse.json({ error: 'no_podes_borrarte_a_vos_mismo' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin.auth.admin.deleteUser(params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true })
}
