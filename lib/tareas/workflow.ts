/**
 * Workflow engine de tareas (F6.9).
 *
 * Maneja transiciones de estado válidas, permisos por rol/usuario,
 * validación de evidencia requerida y persistencia consistente
 * (tarea + historial + comentario de cambio + notificaciones).
 */

import type { SupabaseClient } from '@supabase/supabase-js'

import type {
  EvidenciaItem,
  Tarea,
  TareaEstado,
  TareaHistorialAccion,
  TipoEvidencia,
  TipoTarea,
} from '@/lib/types/tareas'
import { TAREA_ESTADO_LABELS } from '@/lib/constants/tareas'

type Sb = SupabaseClient<any, any, any>

/** Acciones posibles que un usuario puede tomar sobre una tarea. */
export type TareaAccion =
  | 'iniciar'
  | 'completar_directo'
  | 'marcar_verificacion'
  | 'verificar'
  | 'rechazar_verificacion'
  | 'aprobar_final'
  | 'rechazar_final'
  | 'descartar'
  | 'reabrir'
  | 'bloquear'
  | 'desbloquear'

export type AccionPayload = {
  motivo?: string
  comentario?: string
  evidencias?: EvidenciaItem[]
  rol?: string
}

export type AccionResultado = {
  ok: boolean
  error?: string
  tarea?: Tarea
}

/** Roles internos respecto a la tarea (no roles globales del usuario). */
type RolEnTarea =
  | 'responsable'
  | 'verificador'
  | 'aprobador_final'
  | 'creador'
  | 'asignado_secundario'
  | 'gerencia'
  | 'externo'

const GERENCIA = new Set(['super_admin', 'gerente'])

export function rolEnTarea(
  userId: string,
  rolGlobal: string,
  tarea: Pick<
    Tarea,
    | 'responsable_id'
    | 'verificador_id'
    | 'aprobador_final_id'
    | 'creado_por'
    | 'asignados_secundarios'
  >,
): RolEnTarea {
  if (tarea.responsable_id === userId) return 'responsable'
  if (tarea.verificador_id === userId) return 'verificador'
  if (tarea.aprobador_final_id === userId) return 'aprobador_final'
  if (tarea.creado_por === userId) return 'creador'
  if (tarea.asignados_secundarios?.includes(userId))
    return 'asignado_secundario'
  if (GERENCIA.has(rolGlobal)) return 'gerencia'
  return 'externo'
}

/** Estados desde los cuales cada acción es válida. */
const ESTADOS_PARA_ACCION: Record<TareaAccion, TareaEstado[]> = {
  iniciar: ['pendiente', 'asignada'],
  completar_directo: ['pendiente', 'asignada', 'en_progreso'],
  marcar_verificacion: ['en_progreso', 'pendiente', 'asignada'],
  verificar: ['en_verificacion'],
  rechazar_verificacion: ['en_verificacion'],
  aprobar_final: ['en_aprobacion'],
  rechazar_final: ['en_aprobacion'],
  descartar: [
    'pendiente',
    'asignada',
    'en_progreso',
    'en_verificacion',
    'en_aprobacion',
    'bloqueada',
  ],
  reabrir: ['completada', 'descartada', 'rechazada', 'vencida'],
  bloquear: ['pendiente', 'asignada', 'en_progreso'],
  desbloquear: ['bloqueada'],
}

/** Quién puede ejecutar cada acción según su rol respecto a la tarea. */
const ROLES_PERMITIDOS: Record<TareaAccion, RolEnTarea[]> = {
  iniciar: ['responsable', 'gerencia'],
  completar_directo: ['responsable', 'gerencia'],
  marcar_verificacion: ['responsable', 'gerencia'],
  verificar: ['verificador', 'gerencia'],
  rechazar_verificacion: ['verificador', 'gerencia'],
  aprobar_final: ['aprobador_final', 'gerencia'],
  rechazar_final: ['aprobador_final', 'gerencia'],
  descartar: ['responsable', 'verificador', 'creador', 'gerencia'],
  reabrir: ['gerencia'],
  bloquear: ['responsable', 'verificador', 'gerencia'],
  desbloquear: ['responsable', 'verificador', 'gerencia'],
}

export function puedeUsuarioEjecutarAccion(
  userId: string,
  rolGlobal: string,
  tarea: Tarea,
  accion: TareaAccion,
): boolean {
  if (!ESTADOS_PARA_ACCION[accion].includes(tarea.estado)) return false
  const rolT = rolEnTarea(userId, rolGlobal, tarea)
  return ROLES_PERMITIDOS[accion].includes(rolT)
}

/** Acciones que el usuario puede ejecutar en este momento. */
export function accionesDisponibles(
  userId: string,
  rolGlobal: string,
  tarea: Tarea,
  tipo: Pick<TipoTarea, 'niveles_workflow'> | null,
): TareaAccion[] {
  const base: TareaAccion[] = []
  const todas: TareaAccion[] = [
    'iniciar',
    'completar_directo',
    'marcar_verificacion',
    'verificar',
    'rechazar_verificacion',
    'aprobar_final',
    'rechazar_final',
    'descartar',
    'reabrir',
    'bloquear',
    'desbloquear',
  ]
  for (const a of todas) {
    if (puedeUsuarioEjecutarAccion(userId, rolGlobal, tarea, a)) base.push(a)
  }
  // Filtros según nivel de workflow del tipo.
  const nivel = tipo?.niveles_workflow ?? 1
  if (nivel === 1) {
    // Nivel 1: el responsable completa directo, no hay verificación.
    return base.filter(
      (a) =>
        a !== 'marcar_verificacion' &&
        a !== 'verificar' &&
        a !== 'rechazar_verificacion' &&
        a !== 'aprobar_final' &&
        a !== 'rechazar_final',
    )
  }
  if (nivel === 2) {
    // Nivel 2: hay verificación, NO hay aprobación final.
    return base.filter(
      (a) => a !== 'completar_directo' && a !== 'aprobar_final' && a !== 'rechazar_final',
    )
  }
  // Nivel 3: completo
  return base.filter((a) => a !== 'completar_directo')
}

/**
 * Validación de evidencia: chequea que las evidencias cargadas
 * cubran los tipos que el tipo de tarea declara como requeridos.
 */
export function validarEvidencia(
  evidenciaRequerida: TipoEvidencia[],
  evidenciasCargadas: EvidenciaItem[],
): { ok: boolean; faltantes: TipoEvidencia[] } {
  const tiposCargados = new Set(evidenciasCargadas.map((e) => e.tipo))
  const faltantes = evidenciaRequerida.filter((t) => !tiposCargados.has(t))
  return { ok: faltantes.length === 0, faltantes }
}

/** Mapea acción → entrada del historial. */
const ACCION_A_HISTORIAL: Record<TareaAccion, TareaHistorialAccion> = {
  iniciar: 'iniciada',
  completar_directo: 'completada',
  marcar_verificacion: 'marcada_verificacion',
  verificar: 'verificada',
  rechazar_verificacion: 'rechazada',
  aprobar_final: 'aprobada_final',
  rechazar_final: 'rechazada',
  descartar: 'descartada',
  reabrir: 'reabierta',
  bloquear: 'cambio_responsable', // sin entrada propia, reusa
  desbloquear: 'cambio_responsable',
}

/**
 * Calcula los campos a actualizar en la tarea para una acción.
 * No persiste — devuelve el patch para que ejecutarAccion lo aplique.
 */
function calcularPatch(
  tarea: Tarea,
  accion: TareaAccion,
  nivelWorkflow: 1 | 2 | 3,
  payload: AccionPayload,
): Partial<Tarea> {
  const ahora = new Date().toISOString()
  switch (accion) {
    case 'iniciar':
      return {
        estado: 'en_progreso',
        fecha_inicio_real: tarea.fecha_inicio_real ?? ahora,
      }
    case 'completar_directo': {
      const tiempo = calcularTiempoResolucion(tarea, ahora)
      return {
        estado: 'completada',
        fecha_completada: ahora,
        tiempo_resolucion_horas: tiempo,
      }
    }
    case 'marcar_verificacion':
      return {
        estado: 'en_verificacion',
        fecha_inicio_real: tarea.fecha_inicio_real ?? ahora,
        ...(payload.evidencias
          ? { evidencias: [...tarea.evidencias, ...payload.evidencias] }
          : {}),
      }
    case 'verificar': {
      if (nivelWorkflow === 3) {
        return {
          estado: 'en_aprobacion',
          fecha_verificada: ahora,
          comentario_verificacion: payload.comentario || null,
        }
      }
      const tiempo = calcularTiempoResolucion(tarea, ahora)
      return {
        estado: 'completada',
        fecha_verificada: ahora,
        fecha_completada: ahora,
        comentario_verificacion: payload.comentario || null,
        tiempo_resolucion_horas: tiempo,
      }
    }
    case 'rechazar_verificacion':
      return {
        estado: 'en_progreso',
        motivo_rechazada: payload.motivo || 'Sin motivo',
      }
    case 'aprobar_final': {
      const tiempo = calcularTiempoResolucion(tarea, ahora)
      return {
        estado: 'completada',
        fecha_aprobada_final: ahora,
        fecha_completada: ahora,
        tiempo_resolucion_horas: tiempo,
      }
    }
    case 'rechazar_final':
      return {
        estado: 'en_progreso',
        motivo_rechazada: payload.motivo || 'Sin motivo',
      }
    case 'descartar':
      return {
        estado: 'descartada',
        motivo_descartada: payload.motivo || null,
      }
    case 'reabrir':
      return {
        estado: 'pendiente',
        fecha_completada: null,
        fecha_verificada: null,
        fecha_aprobada_final: null,
        motivo_rechazada: null,
        motivo_descartada: null,
      }
    case 'bloquear':
      return { estado: 'bloqueada' }
    case 'desbloquear':
      return { estado: 'pendiente' }
  }
}

function calcularTiempoResolucion(tarea: Tarea, ahora: string): number | null {
  const inicio = tarea.fecha_inicio_real ?? tarea.fecha_creacion
  if (!inicio) return null
  const ms = new Date(ahora).getTime() - new Date(inicio).getTime()
  return Math.max(0, Math.round((ms / 36e5) * 100) / 100)
}

/**
 * Ejecuta una acción end-to-end: valida permisos + evidencia,
 * actualiza la tarea, escribe historial y deja al caller propagar
 * notificaciones (más liviano para evitar dependencias circulares).
 */
export async function ejecutarAccion(
  sb: Sb,
  opts: {
    tarea: Tarea
    tipo: TipoTarea | null
    userId: string
    rolGlobal: string
    accion: TareaAccion
    payload?: AccionPayload
  },
): Promise<AccionResultado> {
  const { tarea, tipo, userId, rolGlobal, accion, payload = {} } = opts

  if (!puedeUsuarioEjecutarAccion(userId, rolGlobal, tarea, accion)) {
    return { ok: false, error: `No tenés permiso para "${accion}" en esta tarea.` }
  }

  // Evidencia: solo se exige al pasar al estado donde se "cierra"
  // el trabajo del responsable (marcar_verificacion en nivel >=2,
  // o completar_directo en nivel 1).
  if (
    (accion === 'marcar_verificacion' || accion === 'completar_directo') &&
    tipo?.evidencia_requerida &&
    tipo.evidencia_requerida.length > 0
  ) {
    const evidencias = [...tarea.evidencias, ...(payload.evidencias ?? [])]
    const { ok, faltantes } = validarEvidencia(tipo.evidencia_requerida, evidencias)
    if (!ok) {
      return {
        ok: false,
        error: `Faltan evidencias requeridas: ${faltantes.join(', ')}.`,
      }
    }
  }

  const nivel = (tipo?.niveles_workflow ?? 1) as 1 | 2 | 3
  const patch = calcularPatch(tarea, accion, nivel, payload)
  const estadoAnterior = tarea.estado

  const { data: updated, error } = await sb
    .from('tareas')
    .update(patch)
    .eq('id', tarea.id)
    .select('*')
    .maybeSingle<Tarea>()
  if (error || !updated) {
    return { ok: false, error: error?.message || 'No se pudo actualizar la tarea.' }
  }

  // Historial
  await sb.from('tareas_historial').insert({
    tarea_id: tarea.id,
    user_id: userId,
    accion: ACCION_A_HISTORIAL[accion],
    estado_anterior: { estado: estadoAnterior },
    estado_nuevo: { estado: updated.estado },
  })

  // Comentario de cambio de estado (si hay motivo o comentario)
  if (estadoAnterior !== updated.estado) {
    const contenido =
      payload.comentario?.trim() ||
      payload.motivo?.trim() ||
      `Cambió a ${TAREA_ESTADO_LABELS[updated.estado]}`
    await sb.from('tareas_comentarios').insert({
      tarea_id: tarea.id,
      user_id: userId,
      contenido,
      es_cambio_estado: true,
      estado_anterior: estadoAnterior,
      estado_nuevo: updated.estado,
    })
  }

  // Gamificación: si quedó completada, otorgar puntos + evaluar badges.
  if (updated.estado === 'completada' && estadoAnterior !== 'completada') {
    try {
      const { alCompletarse } = await import('@/lib/tareas/gamification')
      await alCompletarse(sb, updated, tipo)
    } catch {
      // No bloqueamos el cierre si falla el scoring; se puede recalcular
      // con el cron nightly.
    }
  }

  return { ok: true, tarea: updated }
}

/** Etiquetas para la UI. */
export const ACCION_LABELS: Record<TareaAccion, string> = {
  iniciar: 'Empezar',
  completar_directo: 'Marcar completada',
  marcar_verificacion: 'Marcar para verificar',
  verificar: 'Verificar',
  rechazar_verificacion: 'Rechazar',
  aprobar_final: 'Aprobar definitivamente',
  rechazar_final: 'Rechazar',
  descartar: 'Descartar',
  reabrir: 'Reabrir',
  bloquear: 'Bloquear',
  desbloquear: 'Desbloquear',
}
