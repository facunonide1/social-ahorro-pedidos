import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { evidenciasFaltantes, estadoAlCompletar, type EvidenciaItem } from '@/lib/tareas/workflow-v2'
import { alCompletarse } from '@/lib/tareas/gamification'
import { verificarEvidencia, isSupportedEvidenceMediaType } from '@/lib/ai/verify-evidence'
import { hasAnthropicKey } from '@/lib/ai/client'
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
    const pend = await depsPendientes(adm, tarea.dependencias_ids)
    if (pend.length) {
      return NextResponse.json({ error: `Bloqueada — esperando: ${pend.map((p) => p.titulo).join(', ')}` }, { status: 409 })
    }
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
    const pendC = await depsPendientes(adm, tarea.dependencias_ids)
    if (pendC.length) {
      return NextResponse.json({ error: `Bloqueada — esperando: ${pendC.map((p) => p.titulo).join(', ')}` }, { status: 409 })
    }
    const evidencias: EvidenciaItem[] = [
      ...(Array.isArray(tarea.evidencias) ? tarea.evidencias : []),
      ...(Array.isArray(body?.evidencias) ? body.evidencias : []),
    ]
    // Evidencia por default (OS-2a · B): la tarea la exige salvo opt-out explícito.
    const requeridas: string[] = tarea.evidencia_opt_out ? [] : (tipo?.evidencia_requerida ?? [])
    const faltan = evidenciasFaltantes(requeridas, evidencias)
    if (faltan.length > 0) {
      return NextResponse.json({ error: `Faltan evidencias: ${faltan.join(', ')}` }, { status: 400 })
    }

    // Pre-verificación IA (NORA) sobre la primera foto, si el tipo lo pide.
    const preIA = await preVerificarIA(adm, tipo, evidencias)
    const humana = tarea.verificacion_humana !== false

    // Si NORA sola (sin verificación humana) y rechaza → vuelve a en_progreso.
    if (!humana && preIA && preIA.resultado === 'rechazada') {
      await adm.from('tareas').update({ evidencias, pre_verificacion_ia: preIA }).eq('id', tarea.id)
      return NextResponse.json({ ok: true, estado: 'en_progreso', nora: preIA })
    }

    const destino = estadoAlCompletar(humana)
    const patch: Record<string, unknown> = { evidencias, estado: destino }
    if (preIA) patch.pre_verificacion_ia = preIA
    if (destino === 'completada') {
      Object.assign(patch, calcCompletar(tarea, now))
    }
    await adm.from('tareas').update(patch).eq('id', tarea.id)
    await hist(destino === 'completada' ? 'completada' : 'marcada_verificacion', destino)

    if (destino === 'completada') {
      await premiar(adm, tarea.id)
      await liberarDependientes(adm, tarea.id)
      await avisarChatResuelta(adm, tarea, (user.user_metadata as any)?.nombre ?? null)
    }
    return NextResponse.json({ ok: true, estado: destino, nora: preIA })
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
    await liberarDependientes(adm, tarea.id)
    await avisarChatResuelta(adm, tarea, (user.user_metadata as any)?.nombre ?? null)
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

  // ---- POSPONER (responsable) — OS-2a · A ----
  if (accion === 'posponer') {
    if (!esResponsable) return NextResponse.json({ error: 'no sos el responsable' }, { status: 403 })
    const motivo = String(body?.motivo ?? '').trim()
    if (motivo.length < 3) return NextResponse.json({ error: 'el motivo es obligatorio' }, { status: 400 })
    const hasta = body?.hasta ? new Date(body.hasta).toISOString() : null
    await adm.from('tareas').update({ pospuesta_motivo: motivo, pospuesta_hasta: hasta }).eq('id', tarea.id)
    // El estado no cambia; se historiza como reprogramación.
    await hist('cambio_vencimiento', tarea.estado)
    return NextResponse.json({ ok: true, estado: tarea.estado })
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

/**
 * Dependencias de una tarea que todavía NO están resueltas.
 * Resuelta = tarea dependencia en estado 'completada' o 'descartada'.
 * Devuelve las que bloquean, con su título (para el mensaje "esperando: …").
 */
async function depsPendientes(
  adm: any,
  ids: string[] | null | undefined,
): Promise<{ id: string; titulo: string }[]> {
  if (!Array.isArray(ids) || ids.length === 0) return []
  const { data } = await adm.from('tareas').select('id, titulo, estado').in('id', ids)
  return ((data ?? []) as any[])
    .filter((d) => d.estado !== 'completada' && d.estado !== 'descartada')
    .map((d) => ({ id: d.id, titulo: d.titulo as string }))
}

/**
 * Al completarse (aprobarse) la tarea A, libera las tareas B que dependían de
 * ella cuando TODAS sus dependencias quedaron resueltas. Notifica al responsable
 * de B y lo registra en el historial. Best-effort.
 */
async function liberarDependientes(adm: any, tareaCompletadaId: string) {
  try {
    const { data: dependientes } = await adm
      .from('tareas')
      .select('id, titulo, responsable_id, dependencias_ids, estado')
      .contains('dependencias_ids', [tareaCompletadaId])
    for (const b of (dependientes ?? []) as any[]) {
      if (b.estado === 'completada' || b.estado === 'descartada') continue
      const pend = await depsPendientes(adm, b.dependencias_ids)
      if (pend.length > 0) continue // sigue bloqueada por otra dependencia
      await adm.from('tareas_historial').insert({
        tarea_id: b.id, accion: 'dependencia', estado_nuevo: 'liberada',
      })
      if (b.responsable_id) {
        await adm.from('notificaciones_admin').insert({
          user_id: b.responsable_id, tipo: 'tarea', prioridad: 'media',
          titulo: 'Tarea desbloqueada',
          mensaje: `${b.titulo}: ya podés empezarla, se completaron sus dependencias.`,
          url_accion: `/admin/tareas/${b.id}`,
        })
      }
    }
  } catch {
    /* liberación best-effort */
  }
}

/**
 * Cierra el loop chat→tarea (OS-2b · B): si la tarea nació en un mensaje del
 * chat (datos_custom.canal_id / origen_mensaje_id), publica un mensaje de
 * sistema en ese canal cuando la tarea queda resuelta. Best-effort.
 */
async function avisarChatResuelta(adm: any, tarea: any, nombre: string | null) {
  try {
    const dc = tarea?.datos_custom ?? {}
    const canalId = dc?.canal_id
    if (!canalId || !dc?.origen_mensaje_id) return
    await adm.from('mensajes').insert({
      canal_id: canalId, autor_user_id: null, tipo: 'sistema',
      contenido: `✓ Tarea ${tarea.codigo} resuelta${nombre ? ` por ${nombre}` : ''}.`,
      entidad_relacionada: { tipo: 'tarea', id: tarea.id, codigo: tarea.codigo },
    })
  } catch {
    /* aviso best-effort */
  }
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

/**
 * Pre-verificación IA de NORA sobre la primera evidencia con foto.
 * Best-effort: si falla o no hay foto/prompt/key, devuelve null → verificación
 * humana normal.
 */
async function preVerificarIA(
  adm: any,
  tipo: any,
  evidencias: EvidenciaItem[],
): Promise<{ resultado: string; motivo: string; analizado_at: string } | null> {
  try {
    if (!hasAnthropicKey()) return null
    if (!tipo?.verificacion_ia) return null
    const prompt = tipo?.ia_prompt_verificacion
    if (!prompt) return null

    const foto = evidencias.find(
      (e) => ['foto', 'foto_termometro', 'archivo'].includes(e.tipo) && e.url && !e.url.startsWith('http'),
    )
    if (!foto?.url) return null

    const ext = (foto.url.split('.').pop() || 'jpg').toLowerCase()
    const media = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
    if (!isSupportedEvidenceMediaType(media)) return null

    const { data: signed } = await adm.storage.from('tareas-evidencias').createSignedUrl(foto.url, 600)
    if (!signed?.signedUrl) return null
    const res = await fetch(signed.signedUrl)
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    const base64 = buf.toString('base64')

    const promptFull = foto.valor ? `${prompt}\n(Dato declarado: ${foto.valor})` : prompt
    const verdict = await verificarEvidencia(base64, media, promptFull)
    return {
      resultado: verdict.aprobado ? 'aprobada' : 'rechazada',
      motivo: verdict.razon,
      analizado_at: new Date().toISOString(),
    }
  } catch {
    return null
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
