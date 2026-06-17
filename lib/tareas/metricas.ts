/**
 * Motor de métricas de tareas (F6-T · T9) — funciones puras.
 * Fórmulas exactas según el diseño.
 */

export type TareaMetrica = {
  responsable_id: string | null
  reclamada_por: string | null
  sucursal_id: string | null
  estado: string
  asignacion_tipo: string
  fecha_vencimiento: string | null
  fecha_completada: string | null
  tiempo_resolucion_min: number | null
  demora_min: number | null
  sla_horas: number | null
  rechazos_count: number | null
  puntos_otorgados: number | null
  tipo_categoria?: string | null
  turno_id?: string | null
}

export function pct(num: number, den: number): number {
  if (den <= 0) return 0
  return Math.round((num / den) * 1000) / 10
}

export function avg(nums: number[]): number | null {
  const v = nums.filter((n) => Number.isFinite(n))
  if (v.length === 0) return null
  return Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10
}

/** Métricas de un empleado para un set de tareas (de un día). */
export function metricasEmpleado(tareas: TareaMetrica[]) {
  const asignadas = tareas.length
  const completas = tareas.filter((t) => t.estado === 'completada')
  const completadas = completas.length
  const completadas_en_sla = completas.filter((t) => (t.demora_min ?? 0) <= 0).length
  const rechazadas = tareas.filter((t) => (t.rechazos_count ?? 0) > 0).length
  const reclamadas_pool = tareas.filter((t) => t.reclamada_por != null).length
  const tiempo_promedio_min = avg(completas.map((t) => t.tiempo_resolucion_min ?? NaN))
  const demora_promedio_min = avg(completas.filter((t) => (t.demora_min ?? 0) > 0).map((t) => t.demora_min as number))
  const puntos_dia = completas.reduce((a, t) => a + (t.puntos_otorgados ?? 0), 0)
  return { asignadas, completadas, completadas_en_sla, rechazadas, reclamadas_pool, tiempo_promedio_min, demora_promedio_min, puntos_dia }
}

/** Métricas de una sucursal para un set de tareas (de un día). */
export function metricasSucursal(tareas: TareaMetrica[]) {
  const total = tareas.length
  const completadas = tareas.filter((t) => t.estado === 'completada').length
  const en_sla = tareas.filter((t) => t.estado === 'completada' && (t.demora_min ?? 0) <= 0).length
  const vencidas = tareas.filter((t) => t.estado === 'vencida').length
  const cumplimiento_pct = pct(completadas, total)
  const por_categoria: Record<string, number> = {}
  const por_turno: Record<string, number> = {}
  for (const t of tareas) {
    const c = t.tipo_categoria ?? 'otro'
    por_categoria[c] = (por_categoria[c] ?? 0) + 1
    if (t.turno_id) por_turno[t.turno_id] = (por_turno[t.turno_id] ?? 0) + 1
  }
  return { total, completadas, en_sla, vencidas, cumplimiento_pct, por_categoria, por_turno }
}

/** % cumplimiento de un KPI con tope 110%. */
export function cumplimientoKpi(real: number, meta: number): number {
  if (meta <= 0) return 0
  return Math.min(Math.round((real / meta) * 1000) / 10, 110)
}

/** Score = suma de aportes (peso * min(cumplimiento,100)/100). */
export function scoreObjetivo(kpis: { peso_pct: number; cumplimiento_pct: number }[]): number {
  const s = kpis.reduce((a, k) => a + (k.peso_pct * Math.min(k.cumplimiento_pct, 100)) / 100, 0)
  return Math.round(s * 10) / 10
}

/** Proyección lineal del score a fin de mes según día actual. */
export function proyeccion(scoreActual: number, diaActual: number, diasMes: number): number {
  if (diaActual <= 0) return scoreActual
  return Math.round(Math.min((scoreActual / diaActual) * diasMes, 110) * 10) / 10
}
