import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { informe } from '@/lib/deteccion/lectura'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * E · EL INFORME, A PEDIDO.
 *
 * El semanal llega el lunes. Este es el mismo informe cuando alguien lo quiere
 * un miércoles — y es el mismo texto, no una versión resumida: dos informes
 * que dicen cosas distintas sobre la misma semana no sirven ninguno de los dos.
 *
 * ── POR QUÉ EL ROL NO VIENE DEL CLIENTE ─────────────────────────────────────
 *
 * Porque entonces cualquiera pediría el informe de un gerente pasando
 * `rol=gerente`. El rol se lee de `users_admin` con la sesión de quien pide;
 * la sucursal sí se puede elegir.
 */
export async function GET(req: NextRequest) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'sin sesión' }, { status: 401 })

  const { data: perfil } = await sb.from('users_admin')
    .select('rol, activo').eq('id', user.id)
    .maybeSingle<{ rol: string; activo: boolean }>()
  if (!perfil?.activo) return NextResponse.json({ error: 'sin permiso' }, { status: 403 })

  const sucursal = req.nextUrl.searchParams.get('sucursal')
  const parrafos = await informe(createAdminClient(), {
    sucursal: sucursal || null,
    rol: perfil.rol,
  })

  if (parrafos === null) {
    return NextResponse.json(
      { error: 'no se pudo armar el informe. No significa que no haya nada: significa que no se sabe.' },
      { status: 500 },
    )
  }
  return NextResponse.json({ rol: perfil.rol, parrafos })
}
