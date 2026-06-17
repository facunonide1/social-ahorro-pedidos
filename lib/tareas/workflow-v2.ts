/**
 * Workflow v2 del módulo de tareas enterprise (F6-T · T6) — funciones puras.
 *
 * Estados: pendiente · reclamada · en_progreso · en_verificacion · rechazada ·
 * completada · vencida · descartada.
 *
 * Flujo: (reclamar) → en_progreso → [evidencias completas] →
 *   si verificacion_humana: en_verificacion → aprobar→completada / rechazar→rechazada→en_progreso
 *   si no: completada directa (NORA pre-verifica).
 */

export type EstadoV2 =
  | 'pendiente' | 'reclamada' | 'en_progreso' | 'en_verificacion'
  | 'rechazada' | 'completada' | 'vencida' | 'descartada'

export type AccionV2 = 'empezar' | 'completar' | 'aprobar' | 'rechazar' | 'descartar'

export type EvidenciaItem = {
  tipo: string
  url?: string
  valor?: string
  timestamp: string
  user_id: string
}

const EN_CURSO: EstadoV2[] = ['pendiente', 'reclamada', 'en_progreso', 'rechazada']

/** ¿El usuario es el responsable de la tarea? */
export function esResponsable(tarea: { responsable_id: string | null }, userId: string): boolean {
  return tarea.responsable_id === userId
}

/** ¿Puede aprobar/rechazar? (supervisor de sucursal o gerencia/super). */
export function puedeVerificar(rol: string, esSupervisorDeSuc: boolean): boolean {
  return rol === 'super_admin' || rol === 'gerente' || esSupervisorDeSuc
}

/** Evidencias faltantes según el tipo. */
export function evidenciasFaltantes(
  requeridas: string[],
  cargadas: EvidenciaItem[],
): string[] {
  const tipos = new Set(cargadas.map((e) => e.tipo))
  return requeridas.filter((r) => !tipos.has(r))
}

/** Acciones disponibles para el responsable según estado. */
export function accionesResponsable(estado: EstadoV2): AccionV2[] {
  switch (estado) {
    case 'pendiente':
    case 'reclamada':
      return ['empezar']
    case 'rechazada':
      return ['empezar'] // re-trabaja
    case 'en_progreso':
      return ['completar']
    default:
      return []
  }
}

/** Estado destino al completar, según si requiere verificación humana. */
export function estadoAlCompletar(verificacionHumana: boolean): EstadoV2 {
  return verificacionHumana ? 'en_verificacion' : 'completada'
}

export function esEnCurso(estado: EstadoV2): boolean {
  return EN_CURSO.includes(estado)
}
