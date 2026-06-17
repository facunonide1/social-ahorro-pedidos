import { NextResponse, type NextRequest } from 'next/server'

import { createAdminClient } from '@/lib/supabase/server'
import { isCronRequest } from '@/lib/cron/auth'
import { metricasEmpleado, metricasSucursal, type TareaMetrica } from '@/lib/tareas/metricas'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Cron nightly (02:00) — puebla snapshots de métricas del día anterior
 * (empleados + sucursales). Idempotente vía upsert (UNIQUE por día). (F6-T · T9)
 *
 * Los objetivos mensuales los recalcula el cron calcular-objetivos (F6).
 */
export async function GET(req: NextRequest) {
  if (!isCronRequest(req)) return NextResponse.json({ error: 'sin_secret' }, { status: 401 })
  return run()
}

async function run() {
  const adm = createAdminClient()

  // Ayer en AR
  const ayer = new Date(Date.now() - 86_400_000)
  const fechaAR = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(ayer)
  const ini = `${fechaAR}T00:00:00-03:00`
  const fin = `${fechaAR}T23:59:59-03:00`

  // Tareas cuyo vencimiento fue ayer (la "agenda" de ayer)
  const { data: rows } = await adm
    .from('tareas')
    .select('responsable_id, reclamada_por, sucursal_id, estado, asignacion_tipo, fecha_vencimiento, fecha_completada, tiempo_resolucion_min, demora_min, sla_horas, rechazos_count, puntos_otorgados, turno_id, tipo:tipos_tareas(categoria)')
    .gte('fecha_vencimiento', ini)
    .lte('fecha_vencimiento', fin)
    .limit(5000)

  const tareas: TareaMetrica[] = ((rows ?? []) as any[]).map((r) => ({
    responsable_id: r.responsable_id,
    reclamada_por: r.reclamada_por,
    sucursal_id: r.sucursal_id,
    estado: r.estado,
    asignacion_tipo: r.asignacion_tipo,
    fecha_vencimiento: r.fecha_vencimiento,
    fecha_completada: r.fecha_completada,
    tiempo_resolucion_min: r.tiempo_resolucion_min,
    demora_min: r.demora_min,
    sla_horas: r.sla_horas,
    rechazos_count: r.rechazos_count,
    puntos_otorgados: r.puntos_otorgados,
    tipo_categoria: r.tipo?.categoria ?? null,
    turno_id: r.turno_id,
  }))

  // Por empleado
  const porEmp = new Map<string, TareaMetrica[]>()
  const porSuc = new Map<string, TareaMetrica[]>()
  for (const t of tareas) {
    if (t.responsable_id) {
      const a = porEmp.get(t.responsable_id) ?? []; a.push(t); porEmp.set(t.responsable_id, a)
    }
    if (t.sucursal_id) {
      const a = porSuc.get(t.sucursal_id) ?? []; a.push(t); porSuc.set(t.sucursal_id, a)
    }
  }

  const empRows = [...porEmp.entries()].map(([uid, ts]) => {
    const m = metricasEmpleado(ts)
    return { empleado_user_id: uid, sucursal_id: ts.find((t) => t.sucursal_id)?.sucursal_id ?? null, fecha: fechaAR, ...m }
  })
  const sucRows = [...porSuc.entries()].map(([sid, ts]) => {
    const m = metricasSucursal(ts)
    return { sucursal_id: sid, fecha: fechaAR, ...m }
  })

  if (empRows.length) await adm.from('empleados_metricas_diarias').upsert(empRows, { onConflict: 'empleado_user_id,fecha' })
  if (sucRows.length) await adm.from('sucursales_metricas_diarias').upsert(sucRows, { onConflict: 'sucursal_id,fecha' })

  return NextResponse.json({ ok: true, fecha: fechaAR, empleados: empRows.length, sucursales: sucRows.length })
}
