import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { createAdminUser, vincularEmpleado } from '@/lib/supabase/admin-users'
import type { AdminRole } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

async function requireSuper() {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: 'no autenticado', status: 401 as const }
  const { data: row } = await sb.from('users_admin').select('rol, activo').eq('id', user.id).maybeSingle<{ rol: AdminRole; activo: boolean }>()
  if (!row || !row.activo || row.rol !== 'super_admin') return { error: 'requiere super_admin', status: 403 as const }
  return { ok: true as const, callerId: user.id }
}

/**
 * POST — unificación empleados ↔ usuarios:
 *  - { accion: 'dar_acceso', empleado_id, email, password, rol, sucursal_id?, sucursales_acceso?, nombre?, permisos_custom? }
 *      → crea la cuenta de panel y la vincula al legajo.
 *  - { accion: 'vincular', empleado_id, user_id }     → enlaza un usuario suelto a un legajo.
 *  - { accion: 'desvincular', empleado_id }           → quita el enlace (no borra cuenta).
 */
export async function POST(req: NextRequest) {
  const gate = await requireSuper()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'body inválido' }, { status: 400 }) }
  const accion = b?.accion

  if (accion === 'vincular') {
    if (!b?.empleado_id || !b?.user_id) return NextResponse.json({ error: 'empleado_id y user_id requeridos' }, { status: 400 })
    const r = await vincularEmpleado(b.empleado_id, b.user_id)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  if (accion === 'desvincular') {
    if (!b?.empleado_id) return NextResponse.json({ error: 'empleado_id requerido' }, { status: 400 })
    const r = await vincularEmpleado(b.empleado_id, null)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  if (accion === 'dar_acceso') {
    const res = await createAdminUser({
      email: String(b?.email ?? ''),
      password: String(b?.password ?? ''),
      rol: b?.rol as AdminRole,
      nombre: String(b?.nombre ?? ''),
      sucursal_id: b?.sucursal_id ?? null,
      sucursales_acceso: b?.sucursales_acceso ?? [],
      permisos_custom: b?.permisos_custom ?? {},
      empleado_id: b?.empleado_id ?? null,
    })
    if (!res.ok) return NextResponse.json({ error: res.error, stage: res.stage }, { status: 400 })
    return NextResponse.json({ ok: true, userId: res.userId })
  }

  return NextResponse.json({ error: 'acción inválida' }, { status: 400 })
}
