import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { evidenciasFaltantes, estadoAlCompletar, type EvidenciaItem } from '@/lib/tareas/workflow-v2'
import { alCompletarse } from '@/lib/tareas/gamification'
import type { AdminRole } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Acciones de workflow sobre una tarea (F6-T · T6).
 * body: { accion: 'empezar'|'completar'|'aprobar'|'rechazar'|'descartar',
 *         evidencias?, motivo? }
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no autenticado' }, { status: 401 })

  const { data: me } = await sb
    .from('users_admin')
    .select('rol, activo')
    .eq('id', user.id)
    .maybeSingle<{ rol: AdminRole; activo: boolean }>()
  if (!me?.activo) return NextResponse.json({ error: 'usuario inactivo' }, { status: 403 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'body inválido' }, { status: 400 }) }
  const accion = body?.accion as string

  const adm = createAdminClient()
  const { data: tarea } = await adm.from('tareas').select('*').eq('id', params.id).maybeSingle<any>()
  if (!tarea) return NextResponse.json({ error: 'tarea no encontrada' }, { status: 404 })

  const tipo = tarea.tipo_tarea_id
    ? (await adm.from('tipos_tareas').select('*').eq('id', tarea.tipo_tarea_id).maybeSingle<any>()).data
    : null

  const esResponsable = tarea.responsable_id === user.id
  const gerencia = me.rol === 'super_admin' || me.rol === 'gerente'
  let esSupervisor = gerencia
  if (!esSupervisor && tarea.sucursal_id) {
    const { data: sup } = await adm
      .from('supervisores_tareas')
      .select('id')
      .eq('sucursal_id', tarea.sucursal_id)
      .eq('user_id', user.id)
      .eq('activo', true)
      .maybeSingle()
    esSupervisor = Boolean(sup)
  }

  const now = new Date()
  const nowIso = now.toISOString()

  async function hist(accionH: string, estadoNuevo: string) {
    await adm.from('tareas_historial').insert({
      tarea_id: tarea.id, user_id: user!.id, accion: accionH,
      estado_anterior: tarea.estado, estado_nuevo: estadoNuevo,
    })
  }

  // ---- EMPEZAR ----
  if (accion === 'empezar') {
    if (!esResponsable) return NextResponse.json({ error: 'no sos el responsable' }, { status: 403 })
    await adm.from('tareas').update({
      estado: 'en_progreso',
      fecha_inicio_real: tarea.fecha_inicio_real ?? nowIso,
    }).eq('id', tarea.id)
    await hist('iniciada', 'en_progreso')
    return NextResponse.json({ ok: true, estado: 'en_progreso' })
  }

  // ---- COMPLETAR (responsable) ----
  if (accion === 'completar') {
    if (!esResponsable) return NextResponse.json({ error: 'no sos el responsable' }, { status: 403 })
    const evidencias: EvidenciaItem[] = [
      ...(Array.isArray(tarea.evidencias) ? tarea.evidencias : []),
      ...(Array.isArray(body?.evidencias) ? body.evidencias : []),
    ]
    const requeridas: string[] = tipo?.evidencia_requerida ?? []
    const faltan = evidenciasFaltantes(requeridas, evidencias)
    if (faltan.length > 0) {
      return NextResponse.json({ error: `Faltan evidencias: ${faltan.join(', ')}` }, { status: 400 })
    }

    const destino = estadoAlCompletar(tarea.verificacion_humana !== false)
    const patch: Record<string, unknown> = { evidencias, estado: destino }

    if (destino === 'completada') {
      Object.assign(patch, calcCompletar(tarea, now))
    }
    await adm.from('tareas').update(patch).eq('id', tarea.id)
    await hist(destino === 'completada' ? 'completada' : 'marcada_verificacion', destino)

    if (destino === 'completada') {
      await premiar(adm, tarea.id)
    }
    return NextResponse.json({ ok: true, estado: destino })
  }

  // ---- APROBAR (supervisor) ----
  if (accion === 'aprobar') {
    if (!esSupervisor) return NextResponse.json({ error: 'requiere supervisor' }, { status: 403 })
    if (tarea.estado !== 'en_verificacion') {
      return NextResponse.json({ error: 'la tarea no está en verificación' }, { status: 400 })
    }
    await adm.from('tareas').update({
      estado: 'completada', verificada_por: user.id, verificada_at: nowIso,
      ...calcCompletar(tarea, now),
    }).eq('id', tarea.id)
    await hist('verificada', 'completada')
    await premiar(adm, tarea.id)
    return NextResponse.json({ ok: true, estado: 'completada' })
  }

  // ---- RECHAZAR (supervisor) ----
  if (accion === 'rechazar') {
    if (!esSupervisor) return NextResponse.json({ error: 'requiere supervisor' }, { status: 403 })
    const motivo = String(body?.motivo ?? '').trim()
    if (motivo.length < 10) return NextResponse.json({ error: 'el motivo debe tener al menos 10 caracteres' }, { status: 400 })
    await adm.from('tareas').update({
      estado: 'rechazada', motivo_rechazo: motivo,
      rechazos_count: (tarea.rechazos_count ?? 0) + 1,
      verificada_por: user.id, verificada_at: nowIso,
    }).eq('id', tarea.id)
    await hist('rechazada', 'rechazada')
    if (tarea.responsable_id) {
      await adm.from('notificaciones_admin').insert({
        user_id: tarea.responsable_id, tipo: 'tarea', prioridad: 'alta',
        titulo: 'Tarea rechazada', mensaje: `${tarea.titulo}: ${motivo}`,
        url_accion: `/admin/tareas/${tarea.id}`,
      })
    }
    return NextResponse.json({ ok: true, estado: 'rechazada' })
  }

  // ---- DESCARTAR (supervisor) ----
  if (accion === 'descartar') {
    if (!esSupervisor) return NextResponse.json({ error: 'requiere supervisor' }, { status: 403 })
    await adm.from('tareas').update({ estado: 'descartada', motivo_descartada: body?.motivo ?? null }).eq('id', tarea.id)
    await hist('descartada', 'descartada')
    return NextResponse.json({ ok: true, estado: 'descartada' })
  }

  return NextResponse.json({ error: 'acción inválida' }, { status: 400 })
}

/** Calcula tiempos al completar. */
function calcCompletar(tarea: any, now: Date) {
  const inicio = tarea.fecha_inicio_real ? new Date(tarea.fecha_inicio_real) : new Date(tarea.created_at)
  const tiempo_resolucion_min = Math.max(0, Math.round((now.getTime() - inicio.getTime()) / 60000))
  let demora_min: number | null = null
  if (tarea.fecha_vencimiento) {
    const venc = new Date(tarea.fecha_vencimiento).getTime()
    if (now.getTime() > venc) demora_min = Math.round((now.getTime() - venc) / 60000)
  }
  return {
    fecha_completada: now.toISOString(),
    tiempo_resolucion_min,
    demora_min,
  }
}

/** Otorga puntos + badges + nivel reusando la gamificación de F6. */
async function premiar(adm: any, tareaId: string) {
  try {
    const { data: t } = await adm.from('tareas').select('*').eq('id', tareaId).maybeSingle()
    if (!t) return
    const tipo = t.tipo_tarea_id
      ? (await adm.from('tipos_tareas').select('*').eq('id', t.tipo_tarea_id).maybeSingle()).data
      : null
    await alCompletarse(adm, t, tipo)
    // espejar puntos en la columna nueva
    if (t.puntos_obtenidos != null) {
      await adm.from('tareas').update({ puntos_otorgados: t.puntos_obtenidos }).eq('id', tareaId)
    }
  } catch {
    /* gamificación best-effort */
  }
}
