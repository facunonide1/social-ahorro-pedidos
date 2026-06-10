import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isCronRequest } from '@/lib/cron/auth'
import type { AdminRole } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Genera la agenda de HOY desde tareas_recurrencias activas (F6-T · T4).
 *
 * GET  → ejecución por Vercel Cron (05:00 AR). Auth: CRON_SECRET.
 * POST → "Regenerar agenda de hoy" manual, solo super_admin.
 *
 * Idempotente: no crea una tarea si ya existe una de esa recurrencia creada hoy.
 */
export async function GET(req: NextRequest) {
  if (!isCronRequest(req)) {
    return NextResponse.json({ error: 'sin_secret' }, { status: 401 })
  }
  return run()
}

export async function POST() {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no autenticado' }, { status: 401 })
  const { data: me } = await sb
    .from('users_admin')
    .select('rol, activo')
    .eq('id', user.id)
    .maybeSingle<{ rol: AdminRole; activo: boolean }>()
  if (!me || !me.activo || me.rol !== 'super_admin') {
    return NextResponse.json({ error: 'requiere super_admin' }, { status: 403 })
  }
  return run()
}

type Recurrencia = {
  id: string
  tipo_tarea_id: string
  titulo_plantilla: string | null
  descripcion_plantilla: string | null
  patron: string
  dias_semana: number[] | null
  dia_mes: number | null
  hora_limite: string | null
  sucursal_id: string | null
  asignacion_tipo: string
  turno_id: string | null
  usuario_fijo_id: string | null
  activa: boolean
  ultima_ejecucion: string | null
}

type Tipo = {
  id: string
  nombre: string
  prioridad_default: string
  sla_horas: number | null
  verificacion_humana: boolean
}

async function run() {
  const sb = createAdminClient()

  // Fecha de HOY en zona AR
  const fechaAR = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(new Date()) // YYYY-MM-DD
  const inicioHoy = `${fechaAR}T00:00:00-03:00`
  const dowHoy = new Date(`${fechaAR}T12:00:00-03:00`).getUTCDay() // 0=domingo
  const diaMes = Number(fechaAR.slice(8, 10))
  const nowIso = new Date().toISOString()

  const { data: recs, error } = await sb
    .from('tareas_recurrencias')
    .select(
      'id, tipo_tarea_id, titulo_plantilla, descripcion_plantilla, patron, dias_semana, dia_mes, hora_limite, sucursal_id, asignacion_tipo, turno_id, usuario_fijo_id, activa, ultima_ejecucion',
    )
    .eq('activa', true)
    .limit(500)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const recurrencias = (recs ?? []) as Recurrencia[]
  if (recurrencias.length === 0) {
    return NextResponse.json({ ok: true, creadas: 0, evaluadas: 0 })
  }

  // Tipos (para prioridad/sla/verificación/nombre)
  const tipoIds = [...new Set(recurrencias.map((r) => r.tipo_tarea_id))]
  const { data: tiposData } = await sb
    .from('tipos_tareas')
    .select('id, nombre, prioridad_default, sla_horas, verificacion_humana')
    .in('id', tipoIds)
  const tipos = new Map<string, Tipo>(
    ((tiposData ?? []) as Tipo[]).map((t) => [t.id, t]),
  )

  // Idempotencia: recurrencias que ya generaron tarea hoy
  const { data: yaHoy } = await sb
    .from('tareas')
    .select('recurrencia_id')
    .gte('created_at', inicioHoy)
    .not('recurrencia_id', 'is', null)
  const generadas = new Set(
    ((yaHoy ?? []) as { recurrencia_id: string }[]).map((r) => r.recurrencia_id),
  )

  function toca(r: Recurrencia): boolean {
    switch (r.patron) {
      case 'diaria':
        return true
      case 'semanal':
        return (r.dias_semana ?? []).includes(dowHoy)
      case 'mensual':
        return r.dia_mes === diaMes
      case 'unica':
        return r.ultima_ejecucion == null
      default:
        return false
    }
  }

  const nuevas: any[] = []
  const recIds: string[] = []
  const unicasAdesactivar: string[] = []

  for (const r of recurrencias) {
    if (generadas.has(r.id)) continue
    if (!toca(r)) continue

    const tipo = tipos.get(r.tipo_tarea_id)
    const horaLimite = r.hora_limite ?? '23:59:00'
    const vencimiento = `${fechaAR}T${horaLimite.slice(0, 5)}:00-03:00`
    const esUsuario = r.asignacion_tipo === 'usuario_especifico'
    const responsable = esUsuario ? r.usuario_fijo_id : null

    nuevas.push({
      tipo_tarea_id: r.tipo_tarea_id,
      tipo_origen: 'auto_recurrencia',
      titulo: r.titulo_plantilla || tipo?.nombre || 'Tarea',
      descripcion: r.descripcion_plantilla,
      prioridad: tipo?.prioridad_default ?? 'media',
      estado: responsable ? 'asignada' : 'pendiente',
      asignacion_tipo: r.asignacion_tipo,
      responsable_id: responsable,
      turno_id: r.turno_id,
      sucursal_id: r.sucursal_id,
      verificacion_humana: tipo?.verificacion_humana ?? true,
      sla_horas: tipo?.sla_horas ?? null,
      hora_limite: horaLimite,
      fecha_vencimiento: vencimiento,
      recurrencia_id: r.id,
      creado_por_nombre: 'NORA · agenda automática',
    })
    recIds.push(r.id)
    if (r.patron === 'unica') unicasAdesactivar.push(r.id)
  }

  let creadas = 0
  if (nuevas.length > 0) {
    const { data: ins, error: insErr } = await sb.from('tareas').insert(nuevas).select('id')
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
    creadas = ins?.length ?? 0

    // marcar ultima_ejecucion en las recurrencias generadas
    await sb
      .from('tareas_recurrencias')
      .update({ ultima_ejecucion: nowIso })
      .in('id', recIds)

    // desactivar las 'unica' ya disparadas
    if (unicasAdesactivar.length > 0) {
      await sb
        .from('tareas_recurrencias')
        .update({ activa: false })
        .in('id', unicasAdesactivar)
    }
  }

  return NextResponse.json({
    ok: true,
    fecha: fechaAR,
    evaluadas: recurrencias.length,
    creadas,
  })
}
