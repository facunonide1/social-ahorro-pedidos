import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { setPinEmpleado, quitarPinEmpleado } from '@/lib/auth/pin-login'
import type { AdminRole } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Solo super_admin/gerente pueden setear/resetear PIN de empleados. */
async function requireGestor() {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: 'no autenticado', status: 401 as const }
  const { data: row } = await sb
    .from('users_admin')
    .select('rol, activo')
    .eq('id', user.id)
    .maybeSingle<{ rol: AdminRole; activo: boolean }>()
  if (!row || !row.activo || (row.rol !== 'super_admin' && row.rol !== 'gerente')) {
    return { error: 'requiere super_admin o gerente', status: 403 as const }
  }
  return { ok: true as const }
}

/** POST — setea/resetea N° de empleado + PIN. Body: { numero_empleado, pin } */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireGestor()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'body inválido' }, { status: 400 }) }

  const r = await setPinEmpleado(params.id, String(b?.numero_empleado ?? ''), String(b?.pin ?? ''))
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
  return NextResponse.json({ ok: true })
}

/** DELETE — quita el acceso por PIN (no toca el login por email). */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireGestor()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const r = await quitarPinEmpleado(params.id)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
  return NextResponse.json({ ok: true })
}
