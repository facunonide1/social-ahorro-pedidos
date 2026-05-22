/**
 * Sistema de puntos + badges (F6.16).
 *
 * Llamado desde el workflow al pasar una tarea a 'completada'
 * (vía completar_directo, verificar nivel-2, o aprobar_final nivel-3).
 */

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Tarea, TipoTarea } from '@/lib/types/tareas'
import type { BadgeCriterio } from '@/lib/types/empleados'
import { BADGES } from '@/lib/constants/badges'

type Sb = SupabaseClient<any, any, any>

/**
 * Otorga puntos al responsable (y, si nivel >=2, también al verificador
 * en menor proporción). Actualiza score_total + puntos_obtenidos en la tarea.
 * Devuelve los uids afectados.
 */
export async function otorgarPuntos(
  sb: Sb,
  tarea: Tarea,
  tipo: TipoTarea | null,
): Promise<string[]> {
  const puntosBase = tipo?.puntos_completar ?? 5
  const afectados: string[] = []
  const updates: Promise<unknown>[] = []

  if (tarea.responsable_id) {
    updates.push(sumarScore(sb, tarea.responsable_id, puntosBase))
    afectados.push(tarea.responsable_id)
  }

  // El verificador (si hay nivel >=2 y verificó) recibe 25% redondeado.
  if (tarea.verificador_id && tipo && tipo.niveles_workflow >= 2) {
    const puntosVerif = Math.max(1, Math.round(puntosBase * 0.25))
    updates.push(sumarScore(sb, tarea.verificador_id, puntosVerif))
    if (!afectados.includes(tarea.verificador_id))
      afectados.push(tarea.verificador_id)
  }

  // Guardamos los puntos_obtenidos en la tarea (para el reporte).
  updates.push(
    sb
      .from('tareas')
      .update({ puntos_obtenidos: puntosBase })
      .eq('id', tarea.id),
  )

  await Promise.all(updates)
  return afectados
}

async function sumarScore(sb: Sb, userId: string, puntos: number): Promise<void> {
  const { data: emp } = await sb
    .from('empleados')
    .select('id, score_total')
    .eq('user_id', userId)
    .maybeSingle<{ id: string; score_total: number }>()
  if (!emp) return // user sin ficha de empleado → no hay scoring
  await sb
    .from('empleados')
    .update({ score_total: Number(emp.score_total || 0) + puntos })
    .eq('id', emp.id)
}

/**
 * Evalúa qué badges nuevos corresponden al empleado del user. Solo
 * implementamos los badges cuyos criterios son evaluables hoy con
 * tareas + categorías. Streaks y compliance mensual quedan como TODO.
 */
export async function evaluarBadges(
  sb: Sb,
  userId: string,
): Promise<string[]> {
  const { data: emp } = await sb
    .from('empleados')
    .select('id, badges_obtenidos, score_total')
    .eq('user_id', userId)
    .maybeSingle<{ id: string; badges_obtenidos: string[]; score_total: number }>()
  if (!emp) return []

  // Tareas completadas por este user
  const { data: completadas } = await sb
    .from('tareas')
    .select('estado, fecha_completada, verificador_id, tipo:tipos_tareas(categoria)')
    .or(`responsable_id.eq.${userId},verificador_id.eq.${userId}`)
    .eq('estado', 'completada')
    .limit(2000)
  const filas = (completadas ?? []) as any[]
  const comoResponsable = filas.filter((f) => f.verificador_id !== userId)
  const comoVerificador = filas.filter((f) => f.verificador_id === userId)
  const totalCompletadas = comoResponsable.length
  const totalVerificadas = comoVerificador.length

  const obtenidos = new Set(emp.badges_obtenidos || [])
  const nuevos: string[] = []

  for (const b of BADGES) {
    if (obtenidos.has(b.codigo)) continue
    const c = b.criterio as BadgeCriterio & Record<string, any>
    let gana = false

    if ('tareas_completadas_minimo' in c && totalCompletadas >= c.tareas_completadas_minimo) {
      gana = true
    } else if ('tareas_verificadas_minimo' in c && totalVerificadas >= c.tareas_verificadas_minimo) {
      gana = true
    } else if ('completadas_antes_9am' in c) {
      const cnt = comoResponsable.filter((f) => {
        if (!f.fecha_completada) return false
        return new Date(f.fecha_completada).getHours() < 9
      }).length
      if (cnt >= (c as any).completadas_antes_9am) gana = true
    } else if ('completadas_despues_21' in c) {
      const cnt = comoResponsable.filter((f) => {
        if (!f.fecha_completada) return false
        return new Date(f.fecha_completada).getHours() >= 21
      }).length
      if (cnt >= (c as any).completadas_despues_21) gana = true
    } else if ('tareas_categoria' in c) {
      const cat = Object.keys(c.tareas_categoria as Record<string, number>)[0]
      const min = (c.tareas_categoria as Record<string, number>)[cat]
      const cnt = comoResponsable.filter(
        (f) => pickOne<any>(f.tipo)?.categoria === cat,
      ).length
      if (cnt >= min) gana = true
    }
    // streak_sla_dias y compliance_mes: TODO en F6.15 nightly

    if (gana) nuevos.push(b.codigo)
  }

  if (nuevos.length === 0) return []

  // Bonus de puntos por badges ganados
  const bonus = nuevos.reduce(
    (a, codigo) => a + (BADGES.find((b) => b.codigo === codigo)?.puntos_bonus ?? 0),
    0,
  )

  await sb
    .from('empleados')
    .update({
      badges_obtenidos: [...emp.badges_obtenidos, ...nuevos],
      score_total: Number(emp.score_total || 0) + bonus,
    })
    .eq('id', emp.id)

  return nuevos
}

function pickOne<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null
  return v ?? null
}

/**
 * Recalcula el nivel RPG del empleado del user (0033). Si subió de nivel,
 * devuelve la info del nuevo nivel para notificar; si no, null.
 */
export async function recalcularNivel(
  sb: Sb,
  userId: string,
): Promise<{ nivel: number; nombre: string; titulo: string; beneficios: string[] } | null> {
  const { data: emp } = await sb
    .from('empleados')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle<{ id: string }>()
  if (!emp) return null

  const { data, error } = await sb.rpc('recalcular_nivel_empleado', {
    p_empleado: emp.id,
  })
  if (error || !data || !(data as any).subio) return null
  const d = data as any
  return {
    nivel: d.nivel,
    nombre: d.nombre,
    titulo: d.titulo,
    beneficios: Array.isArray(d.beneficios) ? d.beneficios : [],
  }
}

/**
 * Hook todo-en-uno: cuando una tarea pasa a 'completada' definitiva,
 * otorga puntos + evalúa badges. Genera notificaciones para badges nuevos.
 */
export async function alCompletarse(
  sb: Sb,
  tarea: Tarea,
  tipo: TipoTarea | null,
): Promise<void> {
  if (tarea.estado !== 'completada') return
  const afectados = await otorgarPuntos(sb, tarea, tipo)
  for (const uid of afectados) {
    const nuevos = await evaluarBadges(sb, uid)
    // Notificación de badge ganado
    for (const codigo of nuevos) {
      await sb.from('notificaciones_admin').insert({
        user_id: uid,
        tipo: 'info',
        titulo: '¡Nuevo badge desbloqueado!',
        mensaje: codigo,
        prioridad: 'media',
        url_accion: '/admin/mi-panel?tab=badges',
      })
    }

    // Recálculo de nivel RPG: si subió, notificación celebratoria.
    const subida = await recalcularNivel(sb, uid)
    if (subida) {
      const benef = subida.beneficios.length
        ? ` Desbloqueaste: ${subida.beneficios.join(', ')}.`
        : ''
      await sb.from('notificaciones_admin').insert({
        user_id: uid,
        tipo: 'info',
        titulo: `¡Subiste a ${subida.nombre}!`,
        mensaje: `Ya sos ${subida.titulo}.${benef}`,
        prioridad: 'alta',
        url_accion: '/admin/mi-panel',
      })
    }
  }
}
