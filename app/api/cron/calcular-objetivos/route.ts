import { NextResponse, type NextRequest } from 'next/server'

import { createAdminClient } from '@/lib/supabase/server'
import { isCronRequest } from '@/lib/cron/auth'
import type { ObjetivoEmpleado } from '@/lib/types/empleados'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Cron daily 2am — recalcula los KPIs de objetivos en curso y el
 * score ponderado. Solo implementa fuente_dato 'tareas' por ahora
 * (asistencia/ventas/manual quedan en TODO hasta integrar SIFACO).
 */
export async function GET(req: NextRequest) {
  if (!isCronRequest(req))
    return NextResponse.json({ error: 'sin_secret' }, { status: 401 })

  const sb = createAdminClient()
  const { data: objetivos, error } = await sb
    .from('empleados_objetivos')
    .select('*, empleado:empleados(id, user_id)')
    .eq('estado', 'en_curso')
    .limit(500)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let recalc = 0
  for (const o of (objetivos ?? []) as any[]) {
    const userId = o.empleado?.user_id as string | null
    if (!userId) continue
    const periodoStart = periodoInicio(o)
    const periodoEnd = periodoFin(o)

    // Tareas completadas del empleado en el período
    const { data: tareas } = await sb
      .from('tareas')
      .select('estado, fecha_vencimiento, fecha_completada')
      .eq('responsable_id', userId)
      .eq('estado', 'completada')
      .gte('fecha_completada', periodoStart.toISOString())
      .lt('fecha_completada', periodoEnd.toISOString())
    const completadas = (tareas ?? []) as any[]
    const conVenc = completadas.filter(
      (t) => t.fecha_vencimiento && t.fecha_completada,
    )
    const enSla = conVenc.filter(
      (t) =>
        new Date(t.fecha_completada).getTime() <=
        new Date(t.fecha_vencimiento).getTime(),
    )

    // Verificaciones aprobadas (este user verificó)
    const { data: verifs } = await sb
      .from('tareas')
      .select('id')
      .eq('verificador_id', userId)
      .eq('estado', 'completada')
      .gte('fecha_verificada', periodoStart.toISOString())
      .lt('fecha_verificada', periodoEnd.toISOString())

    // Actualizamos los KPIs que tenemos fórmula
    const kpisActualizados = (o.kpis as ObjetivoEmpleado['kpis']).map((k) => {
      let actual = k.actual
      if (k.codigo === 'tareas_completadas') actual = completadas.length
      else if (k.codigo === 'tareas_completadas_en_sla')
        actual = conVenc.length > 0 ? Math.round((enSla.length / conVenc.length) * 100) : 0
      else if (k.codigo === 'tareas_verificadas_aprobadas')
        actual = verifs?.length ?? 0
      return { ...k, actual }
    })

    // Score ponderado: suma de (actual/meta * peso_pct) clamped a 0-100
    let scorePct = 0
    let pesoTotal = 0
    for (const k of kpisActualizados) {
      if (k.meta <= 0) continue
      const cumplimiento = Math.min(1, Math.max(0, k.actual / k.meta))
      scorePct += cumplimiento * k.peso_pct
      pesoTotal += k.peso_pct
    }
    const scoreFinal = pesoTotal > 0 ? Math.round((scorePct / pesoTotal) * 100) : null

    await sb
      .from('empleados_objetivos')
      .update({
        kpis: kpisActualizados,
        score_pct: scoreFinal,
        score_calculado: scoreFinal,
      })
      .eq('id', o.id)
    recalc++
  }

  return NextResponse.json({ ok: true, objetivos_recalculados: recalc })
}

function periodoInicio(o: any): Date {
  const anio = o.periodo_anio
  if (o.periodo_tipo === 'mensual')
    return new Date(anio, (o.periodo_mes ?? 1) - 1, 1)
  if (o.periodo_tipo === 'trimestral')
    return new Date(anio, ((o.periodo_trimestre ?? 1) - 1) * 3, 1)
  return new Date(anio, 0, 1)
}

function periodoFin(o: any): Date {
  const start = periodoInicio(o)
  const d = new Date(start)
  if (o.periodo_tipo === 'mensual') d.setMonth(d.getMonth() + 1)
  else if (o.periodo_tipo === 'trimestral') d.setMonth(d.getMonth() + 3)
  else d.setFullYear(d.getFullYear() + 1)
  return d
}
