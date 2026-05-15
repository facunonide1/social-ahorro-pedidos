/**
 * Catálogo estático de KPIs (mismo set que el seed de la migración 0030).
 */

import type { KpiUnidad } from '@/lib/types/empleados'

export type KpiStatic = {
  codigo: string
  nombre: string
  descripcion: string
  unidad: KpiUnidad
  fuente_dato: 'manual' | 'tareas' | 'asistencia' | 'ventas'
}

export const KPIS: KpiStatic[] = [
  { codigo: 'tareas_completadas',          nombre: 'Tareas completadas',     descripcion: 'Total de tareas marcadas como completadas en el período', unidad: 'cantidad', fuente_dato: 'tareas' },
  { codigo: 'tareas_completadas_en_sla',   nombre: 'Tareas en SLA',          descripcion: 'Porcentaje de tareas completadas dentro del SLA',          unidad: 'pct',      fuente_dato: 'tareas' },
  { codigo: 'asistencia_pct',              nombre: 'Asistencia',             descripcion: 'Porcentaje de días asistidos sobre días laborables',       unidad: 'pct',      fuente_dato: 'asistencia' },
  { codigo: 'horas_capacitacion',          nombre: 'Horas de capacitación',  descripcion: 'Horas formales de capacitación en el período',             unidad: 'horas',    fuente_dato: 'manual' },
  { codigo: 'ventas_individuales',         nombre: 'Ventas individuales',    descripcion: 'Monto total de ventas atribuidas',                         unidad: 'monto',    fuente_dato: 'ventas' },
  { codigo: 'ticket_promedio',             nombre: 'Ticket promedio',        descripcion: 'Ticket promedio en pesos',                                 unidad: 'monto',    fuente_dato: 'ventas' },
  { codigo: 'nps_clientes',                nombre: 'NPS de clientes',        descripcion: 'Net Promoter Score de clientes atendidos',                 unidad: 'cantidad', fuente_dato: 'manual' },
  { codigo: 'quejas_recibidas',            nombre: 'Quejas recibidas',       descripcion: 'Reclamos formales recibidos',                              unidad: 'cantidad', fuente_dato: 'manual' },
  { codigo: 'elogios_recibidos',           nombre: 'Elogios recibidos',      descripcion: 'Felicitaciones formales recibidas',                        unidad: 'cantidad', fuente_dato: 'manual' },
  { codigo: 'tareas_verificadas_aprobadas',nombre: 'Verificaciones',         descripcion: 'Tareas que verificó y aprobó',                             unidad: 'cantidad', fuente_dato: 'tareas' },
]

export const KPI_BY_CODIGO: Record<string, KpiStatic> = Object.fromEntries(
  KPIS.map((k) => [k.codigo, k]),
)
