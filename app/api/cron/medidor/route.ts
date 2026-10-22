import { NextResponse, type NextRequest } from 'next/server'

import { createAdminClient } from '@/lib/supabase/server'
import { isCronRequest } from '@/lib/cron/auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * B.7 · EL CRON DEL MEDIDOR.
 *
 * Cierra las propuestas que cumplieron el plazo, y de paso recalcula el
 * resumen que leen las pantallas de agentes (migración 0204): ese cálculo
 * tarda ~20 s por alcance y no puede correr adentro de una pantalla.
 *
 * Van juntos en un cron porque el plan Hobby no da para uno más, y porque
 * tienen el mismo dueño: los dos son «lo que el equipo sabe al empezar el
 * día». Si alguna vez se separan, el resumen va primero: el medidor mide
 * contra números, y medir contra números viejos es peor que no medir. Corre todos los días y deja
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

    // v1.2 · El índice del mostrador. Se rearma de noche porque el catálogo
    // cambia cuando entra un maestro, no cuando alguien busca — y la búsqueda
    // tiene que contestar en menos de dos segundos con alguien esperando.
    let mostrador: unknown = null
    try {
      const { data: mi, error: em } = await adm.rpc('mostrador_indice_refrescar')
      if (em) throw new Error(em.message)
      mostrador = mi
    } catch (e: any) {
      mostrador = { error: e?.message ?? 'error' }
    }

    // El resumen de agentes. Si falla, no se tumba el medidor: son dos
    // trabajos distintos y uno roto no justifica perder el otro.
    let resumen: unknown = null
    let resumenError: string | null = null
    try {
      const { data: rs, error: er } = await adm.rpc('agentes_resumen_refrescar')
      if (er) throw new Error(er.message)
      resumen = rs
    } catch (e: any) {
      resumenError = e?.message ?? 'error'
    }

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

    return NextResponse.json({ ok: true, ...data, resumen, resumen_error: resumenError, mostrador })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'error' }, { status: 500 })
  }
}
