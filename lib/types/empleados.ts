/**
 * Types para el módulo extendido de Empleados (F6.2): nivel de acceso,
 * objetivos KPI, evaluaciones, badges y gamificación.
 *
 * La forma base de Empleado vive en lib/types/admin.ts (migración 0026).
 * Acá viven las extensiones que agrega la migración 0030.
 */

import type { Empleado as EmpleadoBase } from '@/lib/types/admin'

export type EmpleadoNivelAcceso = 'empleado' | 'encargado' | 'jefe' | 'admin'

export type ObjetivoPeriodoTipo = 'mensual' | 'trimestral' | 'anual'
export type ObjetivoEstado = 'en_curso' | 'cerrado'

/** Empleado con campos agregados por la migración 0030. */
export type EmpleadoExtended = EmpleadoBase & {
  user_id: string | null
  supervisor_id: string | null
  foto_perfil_url: string | null
  nivel_acceso: EmpleadoNivelAcceso
  sucursales_acceso: string[]
  score_total: number
  badges_obtenidos: string[]
}

export type KpiUnidad = 'cantidad' | 'pct' | 'monto' | 'horas' | 'dias'

export type KpiCatalogoItem = {
  id: string
  codigo: string
  nombre: string
  descripcion: string | null
  unidad: KpiUnidad
  fuente_dato: string
  query_calculo: string | null
  activo: boolean
  created_at: string
}

/** KPI configurado dentro de un objetivo del empleado. */
export type ObjetivoKpi = {
  codigo: string
  nombre: string
  meta: number
  actual: number
  peso_pct: number
  unidad: KpiUnidad
}

export type ObjetivoEmpleado = {
  id: string
  empleado_id: string
  periodo_tipo: ObjetivoPeriodoTipo
  periodo_anio: number
  periodo_mes: number | null
  periodo_trimestre: number | null
  kpis: ObjetivoKpi[]
  score_calculado: number | null
  score_pct: number | null
  estado: ObjetivoEstado
  created_at: string
  closed_at: string | null
}

export type EvaluacionEmpleado = {
  id: string
  empleado_id: string
  evaluador_id: string | null
  periodo: string
  puntaje: number | null
  areas_fortaleza: string | null
  areas_mejora: string | null
  comentarios: string | null
  created_at: string
}

export type BadgeCriterio =
  | { tareas_completadas_minimo: number }
  | { streak_sla_dias: number }
  | { tareas_verificadas_minimo: number }
  | { completadas_antes_9am: number }
  | { completadas_despues_21: number }
  | { tareas_categoria: Record<string, number> }
  | { compliance_mes: boolean }
  | Record<string, unknown>

export type BadgeCatalogo = {
  id: string
  codigo: string
  nombre: string
  descripcion: string | null
  icono: string | null
  color: string | null
  criterio: BadgeCriterio
  puntos_bonus: number
  activo: boolean
  created_at: string
}
