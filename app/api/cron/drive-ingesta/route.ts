import { NextResponse, type NextRequest } from 'next/server'

import { correrIngesta } from '@/lib/drive/correr'
import { ingestaHabilitada } from '@/lib/drive/flag'
import { cronAutorizado } from '@/lib/drive/cron-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * El cron de la ingesta (vercel.json, cada 30 minutos). Exige exactamente
 * `Authorization: Bearer ${CRON_SECRET}`, que es lo que manda Vercel cuando la
 * variable existe. Sin CRON_SECRET configurado contesta 503 y lo dice: antes
 * caía al secreto viejo o devolvía 401 sin explicar nada.
 * Con DRIVE_INGESTA_ENABLED distinto de 'true', no toca Drive ni la base.
 */
export async function GET(req: NextRequest) {
  const auth = cronAutorizado(req.headers.get('authorization'), process.env.CRON_SECRET)
  if (auth === 'sin_configurar') {
    console.error('[drive-ingesta] falta CRON_SECRET: Vercel no manda el header y el cron no puede autenticarse')
    return NextResponse.json({ error: 'cron_sin_configurar' }, { status: 503 })
  }
  if (auth === 'rechazado') return NextResponse.json({ error: 'sin_secret' }, { status: 401 })
  if (!ingestaHabilitada()) return NextResponse.json({ ok: true, omitido: 'deshabilitado' })
  const r = await correrIngesta()
  console.log('[drive-ingesta] corrida', JSON.stringify({ ...r, resultados: undefined }))
  return NextResponse.json(r)
}
