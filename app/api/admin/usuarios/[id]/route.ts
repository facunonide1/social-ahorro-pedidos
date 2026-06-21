import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { updateAdminUser } from '@/lib/supabase/admin-users'
import type { AdminRole } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

async function requireSuper() {
  const sb = createClient()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) return { error: 'no autenticado', status: 401 as const }
  const { data: row } = await sb
    .from('users_admin')
    .select('rol, activo')
    .eq('id', user.id)
    .maybeSingle<{ rol: AdminRole; activo: boolean }>()
  if (!row || !row.activo || row.rol !== 'super_admin') {
    return { error: 'requiere super_admin', status: 403 as const, callerId: '' }
  }
  return { ok: true as const, callerId: user.id }
}

/** Edición de usuario admin (rol, sucursal, activo, permisos, nombre). */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const gate = await requireSuper()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'body inválido' }, { status: 400 })
  }

  // Salvaguarda: un super_admin no puede auto-desactivarse ni bajarse el rol.
  if (params.id === gate.callerId) {
    if (body?.activo === false || (body?.rol && body.rol !== 'super_admin')) {
      return NextResponse.json(
        { error: 'no podés desactivarte ni cambiar tu propio rol de super_admin' },
        { status: 400 },
      )
    }
  }

  const res = await updateAdminUser(params.id, {
    rol: body?.rol as AdminRole | undefined,
    sucursal_id: body?.sucursal_id,
    sucursales_acceso: body?.sucursales_acceso,
    activo: body?.activo,
    permisos_custom: body?.permisos_custom,
    nombre: body?.nombre,
  })

  if (!res.ok) {
    return NextResponse.json({ error: res.error }, { status: 400 })
  }
  return NextResponse.json({ ok: true })
}
