import { NextResponse, type NextRequest } from 'next/server'

import { createAdminClient } from '@/lib/supabase/server'
import { isCronRequest } from '@/lib/cron/auth'
import { automatizacionActiva } from '@/lib/os/definicion'
import { publicarAvisos } from '@/lib/proveedores/avisos'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Los avisos del circuito de proveedores, una vez por día.
 *
 * Sólo publica avisos: no paga, no aprueba y no cierra nada. Lo reversible sale
 * solo; lo que compromete plata espera a una persona (regla de oro 7).
 */
export async function GET(req: NextRequest) {
  if (!isCronRequest(req)) return NextResponse.json({ error: 'sin_secret' }, { status: 401 })
  if (!(await automatizacionActiva('compras', 'avisos_proveedores', true))) {
    return NextResponse.json({ ok: true, omitida: 'la declaración la tiene apagada' })
  }
  try {
    const r = await publicarAvisos(createAdminClient())
    return NextResponse.json({ ok: true, ...r })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'falló' }, { status: 500 })
  }
}
