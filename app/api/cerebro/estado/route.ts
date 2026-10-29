import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { leerCerebro } from '@/lib/cerebro/lectura'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * A · La lectura del cerebro, para que la pantalla la refresque sola.
 *
 * Con la sesión de quien mira: `cerebro_estado()` decide adentro si es el
 * dueño. Esta ruta no tiene un cliente de servicio a mano, a propósito.
 *
 * Si la lectura tarda, devuelve `estado: null` con el motivo y un 200: no es
 * un error del servidor, es «no lo pude saber», y la pantalla tiene que poder
 * decirlo con las mismas palabras.
 */
export async function GET() {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, estado: null, por_que: 'no hay sesión' }, { status: 401 })

  const r = await leerCerebro(sb)
  return NextResponse.json(r, { headers: { 'cache-control': 'no-store' } })
}
