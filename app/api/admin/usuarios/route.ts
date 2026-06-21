import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { createAdminUser } from '@/lib/supabase/admin-users'
import type { AdminRole } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Verifica que el caller sea super_admin activo. */
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
    return { error: 'requiere super_admin', status: 403 as const }
  }
  return { ok: true as const }
}

/** Alta de usuario admin (F6.5.T5). */
export async function POST(req: NextRequest) {
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

  const res = await createAdminUser({
    email: String(body?.email ?? ''),
    password: String(body?.password ?? ''),
    rol: body?.rol as AdminRole,
    nombre: String(body?.nombre ?? ''),
    sucursal_id: body?.sucursal_id ?? null,
    sucursales_acceso: body?.sucursales_acceso ?? [],
    permisos_custom: body?.permisos_custom ?? {},
    empleado_id: body?.empleado_id ?? null,
  })

  if (!res.ok) {
    return NextResponse.json({ error: res.error, stage: res.stage }, { status: 400 })
  }
  return NextResponse.json({ ok: true, userId: res.userId })
}
