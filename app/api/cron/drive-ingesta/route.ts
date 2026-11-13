import { NextResponse, type NextRequest } from 'next/server'

import { correrIngesta } from '@/lib/drive/correr'
import { validarCron } from '@/lib/drive/cron'
import { ingestaHabilitada } from '@/lib/drive/flag'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Cron de la ingesta de Drive (vercel.json, cada 30 minutos).
 *
 * 1. Sólo con `Authorization: Bearer <CRON_SECRET>`, el que manda Vercel.
 * 2. Con DRIVE_INGESTA_ENABLED distinto de 'true', responde 200 sin tocar nada.
 * 3. Una corrida a la vez (lock en la base que vence solo).
 * Cada corrida deja una línea JSON en el log (`"cron":"drive-ingesta"`).
 */
export async function GET(req: NextRequest) {
  const t0 = Date.now()
  const log = (x: Record<string, unknown>) => console.log(JSON.stringify({ cron: 'drive-ingesta', ms: Date.now() - t0, ...x }))

  const motivo = validarCron(req.headers)
  if (motivo === 'sin_cron_secret') {
    log({ ok: false, error: 'CRON_SECRET no está configurado en Vercel: el cron no puede autenticarse' })
    return NextResponse.json({ error: 'CRON_SECRET no configurado' }, { status: 500 })
  }
  if (motivo !== 'ok') return NextResponse.json({ error: 'no autorizado' }, { status: 401 })

  if (!ingestaHabilitada()) {
    log({ ok: true, omitido: 'DRIVE_INGESTA_ENABLED no es true' })
    return NextResponse.json({ ok: true, omitido: 'deshabilitado' })
  }

  try {
    const r = await correrIngesta()
    log({ ok: (r as any).ok !== false, resumen: { ...r, resultados: undefined } })
    return NextResponse.json(r)
  } catch (e: any) {
    log({ ok: false, error: e?.message ?? String(e) })
    return NextResponse.json({ error: e?.message ?? 'falló' }, { status: 500 })
  }
}
