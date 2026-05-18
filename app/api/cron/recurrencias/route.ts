import { NextResponse, type NextRequest } from 'next/server'

import { createAdminClient } from '@/lib/supabase/server'
import { isCronRequest } from '@/lib/cron/auth'
import type { RecurrenciaPatron, TareaRecurrencia } from '@/lib/types/tareas'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Cron daily 6am — genera tareas desde tareas_recurrencias activas.
 *
 * Para cada recurrencia con proxima_ejecucion <= now():
 *   1. Inserta una tarea según la plantilla del tipo.
 *   2. Calcula la siguiente fecha de ejecución según el patrón.
 *   3. Actualiza ultima_ejecucion + proxima_ejecucion.
 */
export async function GET(req: NextRequest) {
  if (!isCronRequest(req))
    return NextResponse.json({ error: 'sin_secret' }, { status: 401 })

  const sb = createAdminClient()
  const now = new Date()

  const { data: recs, error } = await sb
    .from('tareas_recurrencias')
    .select('*')
    .eq('activa', true)
    .or(`proxima_ejecucion.is.null,proxima_ejecucion.lte.${now.toISOString()}`)
    .limit(200)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const creadas: string[] = []
  const reschedules: Array<{ id: string; proxima: string }> = []

  for (const r of (recs ?? []) as TareaRecurrencia[]) {
    // Si tiene fecha_fin pasada → desactivar
    if (r.fecha_fin && new Date(r.fecha_fin) < now) {
      await sb
        .from('tareas_recurrencias')
        .update({ activa: false })
        .eq('id', r.id)
      continue
    }

    // Vencimiento: 24hs después por defecto (los crons posteriores marcan vencida)
    const vencimiento = new Date(now)
    vencimiento.setHours(vencimiento.getHours() + 24)

    const { data: nuevaTarea } = await sb
      .from('tareas')
      .insert({
        tipo_tarea_id: r.tipo_tarea_id,
        tipo_origen: 'recurrencia',
        titulo: r.titulo_plantilla.replace(/\{fecha\}/g, now.toISOString().slice(0, 10)),
        descripcion: r.descripcion_plantilla,
        estado: r.responsable_default_id ? 'asignada' : 'pendiente',
        responsable_id: r.responsable_default_id,
        verificador_id: r.verificador_default_id,
        sucursal_id: r.sucursal_id,
        rol_destinatario: r.rol_responsable,
        fecha_asignacion: r.responsable_default_id ? now.toISOString() : null,
        fecha_vencimiento: vencimiento.toISOString(),
        recurrencia_id: r.id,
      })
      .select('id')
      .maybeSingle<{ id: string }>()
    if (nuevaTarea) creadas.push(nuevaTarea.id)

    const proxima = calcularProxima(r.patron, now, r)
    reschedules.push({ id: r.id, proxima: proxima.toISOString() })
  }

  for (const r of reschedules) {
    await sb
      .from('tareas_recurrencias')
      .update({
        ultima_ejecucion: now.toISOString(),
        proxima_ejecucion: r.proxima,
      })
      .eq('id', r.id)
  }

  return NextResponse.json({
    ok: true,
    recurrencias_procesadas: recs?.length ?? 0,
    tareas_creadas: creadas.length,
  })
}

function calcularProxima(
  patron: RecurrenciaPatron,
  now: Date,
  r: TareaRecurrencia,
): Date {
  const d = new Date(now)
  // Las generamos para "mañana" según patrón.
  switch (patron) {
    case 'diaria':
      d.setDate(d.getDate() + 1)
      break
    case 'semanal':
      d.setDate(d.getDate() + 7)
      break
    case 'mensual':
      d.setMonth(d.getMonth() + 1)
      if (r.dia_mes) d.setDate(Math.min(r.dia_mes, daysInMonth(d)))
      break
    case 'anual':
      d.setFullYear(d.getFullYear() + 1)
      break
    case 'custom_cron':
      // TODO: parser de cron — por ahora cada día.
      d.setDate(d.getDate() + 1)
      break
  }
  // Hora de creación configurada
  const [hh, mm] = (r.hora_creacion || '06:00').split(':').map(Number)
  d.setHours(hh ?? 6, mm ?? 0, 0, 0)
  return d
}

function daysInMonth(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
}
