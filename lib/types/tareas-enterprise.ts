/**
 * Tipos del módulo de tareas enterprise v2 (F6-T).
 * Mirror de turnos_sucursal, supervisores_tareas y enums de la migración 0037.
 */

export type TareaAsignacion =
  | 'usuario_especifico'
  | 'pool_turno'
  | 'pool_sucursal'
  | 'rol'

export const ASIGNACION_LABELS: Record<TareaAsignacion, string> = {
  usuario_especifico: 'Usuario específico',
  pool_turno: 'Pool del turno',
  pool_sucursal: 'Pool de la sucursal',
  rol: 'Por rol',
}

export type TipoTareaAlcance = 'global' | 'por_sucursal'

export type TareaCategoria =
  | 'finanzas'
  | 'compras'
  | 'operaciones'
  | 'rrhh'
  | 'comercial'
  | 'sucursal'
  | 'regulatorio'
  | 'limpieza'
  | 'seguridad'
  | 'atencion_cliente'
  | 'inventario'
  | 'cadena_frio'
  | 'otro'

export const CATEGORIAS: TareaCategoria[] = [
  'finanzas',
  'compras',
  'operaciones',
  'rrhh',
  'comercial',
  'sucursal',
  'regulatorio',
  'limpieza',
  'seguridad',
  'atencion_cliente',
  'inventario',
  'cadena_frio',
  'otro',
]

export const CATEGORIA_LABELS: Record<TareaCategoria, string> = {
  finanzas: 'Finanzas',
  compras: 'Compras',
  operaciones: 'Operaciones',
  rrhh: 'RRHH',
  comercial: 'Comercial',
  sucursal: 'Sucursal',
  regulatorio: 'Regulatorio',
  limpieza: 'Limpieza',
  seguridad: 'Seguridad',
  atencion_cliente: 'Atención al cliente',
  inventario: 'Inventario',
  cadena_frio: 'Cadena de frío',
  otro: 'Otro',
}

export type TurnoSucursal = {
  id: string
  sucursal_id: string
  nombre: string
  hora_inicio: string // 'HH:MM:SS'
  hora_fin: string
  dias_semana: number[] // 0=domingo … 6=sábado
  activo: boolean
  orden: number
  created_at: string
  updated_at: string
}

export type SupervisorTarea = {
  id: string
  sucursal_id: string
  user_id: string
  categorias: string[] | null // null = todas
  activo: boolean
  designado_por: string | null
  created_at: string
}

/** Días de la semana en orden de visualización (lun→dom). value = int DB. */
export const DIAS_SEMANA: { value: number; corto: string; largo: string }[] = [
  { value: 1, corto: 'L', largo: 'Lunes' },
  { value: 2, corto: 'M', largo: 'Martes' },
  { value: 3, corto: 'M', largo: 'Miércoles' },
  { value: 4, corto: 'J', largo: 'Jueves' },
  { value: 5, corto: 'V', largo: 'Viernes' },
  { value: 6, corto: 'S', largo: 'Sábado' },
  { value: 0, corto: 'D', largo: 'Domingo' },
]

/** "08:00:00" → "08:00". */
export function hhmm(time: string | null | undefined): string {
  if (!time) return ''
  return time.slice(0, 5)
}

/** Etiqueta compacta de días: [1,2,3,4,5,6] → "Lun a Sáb"; si no, lista corta. */
export function diasLabel(dias: number[]): string {
  const set = new Set(dias)
  const semana = [1, 2, 3, 4, 5, 6, 0]
  if (semana.every((d) => set.has(d))) return 'Todos los días'
  if ([1, 2, 3, 4, 5, 6].every((d) => set.has(d)) && !set.has(0)) return 'Lun a Sáb'
  if ([1, 2, 3, 4, 5].every((d) => set.has(d)) && set.size === 5) return 'Lun a Vie'
  return DIAS_SEMANA.filter((d) => set.has(d.value))
    .map((d) => d.corto)
    .join(' ')
}

/** Detecta solapamiento de horarios entre turnos (mismo día). */
export function turnosSolapan(a: TurnoSucursal, b: TurnoSucursal): boolean {
  const compartenDia = a.dias_semana.some((d) => b.dias_semana.includes(d))
  if (!compartenDia) return false
  const ini = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
  const aIni = ini(a.hora_inicio)
  const aFin = ini(a.hora_fin)
  const bIni = ini(b.hora_inicio)
  const bFin = ini(b.hora_fin)
  return aIni < bFin && bIni < aFin
}
