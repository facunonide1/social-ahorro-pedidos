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
 *
 * ── v1.3 · Y LA CORRIDA DE LOS DETECTORES ───────────────────────────────────
 *
 * Va acá y no en un cron nuevo, por dos razones y la segunda es la que manda:
 *
 *   · el plan Hobby restringe los crons, y ya hay veinte declarados;
 *   · los dos comparten el presupuesto de interrupción. `avisos_por_corrida`
 *     vale 40 y es UNO: si los detectores corrieran en otro cron con el mismo
 *     parámetro, cada uno publicaría sus 40 y el total sería 80 — o sea,
 *     ninguno de los dos sería un presupuesto.
 *
 * Corriendo seguidos, el que va segundo ve lo que publicó el primero.
 *
 * La detección va DESPUÉS de los avisos de compras: si falla, los avisos de
 * compras ya están publicados. Son dos trabajos y uno roto no justifica
 * perder el otro — es lo mismo que hace el cron del medidor.
 */
export async function GET(req: NextRequest) {
  if (!isCronRequest(req)) return NextResponse.json({ error: 'sin_secret' }, { status: 401 })
  if (!(await automatizacionActiva('compras', 'avisos_compras', true))) {
    return NextResponse.json({ ok: true, omitida: 'la declaración la tiene apagada' })
  }
  try {
    const adm = createAdminClient()
    const r = await publicarAvisosCompras(adm)

    let deteccion: unknown = null
    try {
      const { data, error } = await adm.rpc('deteccion_correr')
      if (error) throw new Error(error.message)
      deteccion = data
    } catch (e: any) {
      deteccion = { error: e?.message ?? 'falló' }
    }

    return NextResponse.json({ ok: true, ...r, deteccion })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'falló' }, { status: 500 })
  }
}
