import { NextResponse, type NextRequest } from 'next/server'

import { createAdminClient } from '@/lib/supabase/server'
import { isCronRequest } from '@/lib/cron/auth'
import type { RecurrenciaPatron, TareaRecurrencia } from '@/lib/types/tareas'
import { automatizacionActiva } from '@/lib/os/definicion'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * DEPRECADO — 27-ago-2026, v0.81. Lo reemplaza /api/cron/generar-agenda.
 *
 * ── QUÉ HACÍA ───────────────────────────────────────────────────────────────
 *
 * Lo mismo: leer `tareas_recurrencias` activas e insertar las tareas que tocan.
 * Nunca corrió: no estaba agendado en vercel.json, y aunque lo hubiera estado,
 * el middleware mandaba todos los crons a /login hasta v0.80.
 *
 * ── POR QUÉ SE VA ÉSTE Y NO EL OTRO ─────────────────────────────────────────
 *
 * No es por antigüedad. `generar-agenda` cubre tres cosas que éste no:
 *
 *   1. Es idempotente: no crea una tarea si ya existe una de esa recurrencia
 *      creada hoy. Éste se apoya en `proxima_ejecucion`, así que dos corridas
 *      el mismo día —o una fecha mal escrita— duplican.
 *   2. Respeta `asignacion_tipo` y `turno_id`. Éste asigna sin mirarlos, y las
 *      cuatro recurrencias cargadas son `pool_sucursal`.
 *   3. Contempla `dias_semana` y `dia_mes` para los patrones semanal y mensual.
 *
 * Lo único que este archivo hacía y el otro no es desactivar una recurrencia
 * cuando pasó su `fecha_fin`. Se verificó contra los datos: ninguna ruta y
 * ninguna pantalla escribe `fecha_fin`, así que no había nada que desactivar.
 * La columna queda anotada como residuo en el reporte de v0.81.
 *
 * ── POR QUÉ NO SE BORRA ─────────────────────────────────────────────────────
 *
 * Mismo procedimiento que 0083 y 0109, que funcionó las dos veces: se desactiva
 * y se deja escrito el borrado. Si algo lo llamaba y no lo detectamos, falla de
 * forma visible —410 con el motivo— en vez de silenciosamente.
 *
 * BORRAR ESTE ARCHIVO DESPUÉS DEL 25-nov-2026 (90 días), si nadie lo reclamó.
 * No queda nada más que sacar: no está en vercel.json ni lo importa nadie.
 */
export async function GET(req: NextRequest) {
  if (!isCronRequest(req))
    return NextResponse.json({ error: 'sin_secret' }, { status: 401 })

  return NextResponse.json({
    error: 'deprecado',
    detalle: 'Este generador de recurrencias fue reemplazado por /api/cron/generar-agenda el 27-ago-2026. Genera las mismas tareas, sin duplicar y respetando el turno. Si algo estaba llamando a esta ruta, hay que apuntarlo allá.',
  }, { status: 410 })
}

/** El cuerpo viejo, inalcanzable. Se va con el archivo el 25-nov-2026. */
async function _corridaVieja(req: NextRequest) {
  if (!(await automatizacionActiva('tareas', 'generar_recurrencias', true))) {
    return NextResponse.json({ ok: true, omitida: 'la declaración la tiene apagada' })
  }

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
