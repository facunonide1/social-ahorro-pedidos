import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { leerCierreDeFoto } from '@/lib/caja/leer-cierre'
import type { AdminRole } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const ROLES: AdminRole[] = [
  'super_admin', 'gerente', 'tesoreria', 'administrativo', 'encargado_sucursal', 'sucursal', 'cajero',
]

/**
 * E.2 · Leer los totales de la foto del cierre.
 *
 * Devuelve lo leído y NO lo guarda. Quien cierra ve los números al lado de la
 * foto y confirma o corrige: un total mal leído que entra solo es peor que no
 * leer nada, porque el control de caja va a marcar una diferencia que no
 * existe y alguien va a salir a buscar plata que está.
 */
export async function POST(req: NextRequest) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no autenticado' }, { status: 401 })

  const { data: me } = await sb.from('users_admin')
    .select('rol, activo').eq('id', user.id)
    .maybeSingle<{ rol: AdminRole; activo: boolean }>()
  if (!me?.activo || !ROLES.includes(me.rol)) {
    return NextResponse.json({ error: 'sin permiso' }, { status: 403 })
  }

  const b = await req.json().catch(() => null)
  const base64 = typeof b?.base64 === 'string' ? b.base64 : null
  const mime = typeof b?.mime === 'string' ? b.mime : null
  if (!base64 || !mime) return NextResponse.json({ error: 'falta la foto' }, { status: 400 })

  const r = await leerCierreDeFoto({ base64, mime })
  if (r.estado === 'error') return NextResponse.json({ error: r.mensaje }, { status: 422 })
  return NextResponse.json({ ok: true, datos: r.datos })
}
