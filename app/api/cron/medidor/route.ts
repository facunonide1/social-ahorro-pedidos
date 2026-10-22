import { NextResponse, type NextRequest } from 'next/server'

import { createAdminClient } from '@/lib/supabase/server'
import { isCronRequest } from '@/lib/cron/auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * B.7 · EL CRON DEL MEDIDOR.
 *
 * Cierra las propuestas que cumplieron el plazo. Corre todos los días y deja
 * dicho cuándo corrió: un medidor que no se sabe si corrió es un marcador en
 * el que no se puede confiar.
 *
 * ── POR QUÉ NO SE SALTEA POR DATOS DE DEMOSTRACIÓN ──────────────────────────
 *
 * Los otros crons usan `puedeCalcular()` para no escribir histórico sobre
 * datos sembrados. Éste no lo necesita: sólo lee la bitácora, que se llena con
 * decisiones de personas reales. Si alguien decidió, eso pasó de verdad.
 */
export async function GET(req: NextRequest) {
  if (!isCronRequest(req)) return NextResponse.json({ error: 'no autorizado' }, { status: 401 })

  const adm = createAdminClient()
  try {
    const { data, error } = await adm.rpc('medidor_cerrar').maybeSingle<{
      medidas: number; acertaron: number; sin_poder_medir: number
    }>()
    if (error) throw new Error(error.message)

    // Queda dicho cuándo corrió y con qué resultado. Sin esto, «el marcador
    // está vacío» no se puede distinguir de «el medidor nunca corrió».
    await adm.from('agente_bitacora').insert({
      agente: 'sistema', accion: 'medidor',
      propuso: `Medidor: ${data?.medidas ?? 0} propuestas medidas, ${data?.acertaron ?? 0} acertaron, ` +
        `${data?.sin_poder_medir ?? 0} no se pudieron medir.`,
      por_que: 'Corrida diaria del medidor de aciertos.',
      estado: 'ejecutada',
      decidio_at: new Date().toISOString(),
      decidio_que: 'corrida automatica',
      resultado: data as any,
      resultado_at: new Date().toISOString(),
      clave: `medidor:${new Date().toISOString().slice(0, 10)}`,
    })

    return NextResponse.json({ ok: true, ...data })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'error' }, { status: 500 })
  }
}
