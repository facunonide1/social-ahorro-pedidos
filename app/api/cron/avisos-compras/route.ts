import { NextResponse, type NextRequest } from 'next/server'

import { createAdminClient } from '@/lib/supabase/server'
import { isCronRequest } from '@/lib/cron/auth'
import { automatizacionActiva } from '@/lib/os/definicion'
import { publicarAvisosCompras } from '@/lib/compras/avisos'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Los avisos de compras, una vez por día.
 *
 * Publica avisos y guarda la foto del día. No compra, no emite órdenes y no
 * paga: eso lo decide y lo aprueba una persona.
 */
export async function GET(req: NextRequest) {
  if (!isCronRequest(req)) return NextResponse.json({ error: 'sin_secret' }, { status: 401 })
  if (!(await automatizacionActiva('compras', 'avisos_compras', true))) {
    return NextResponse.json({ ok: true, omitida: 'la declaración la tiene apagada' })
  }
  try {
    const r = await publicarAvisosCompras(createAdminClient())
    return NextResponse.json({ ok: true, ...r })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'falló' }, { status: 500 })
  }
}
