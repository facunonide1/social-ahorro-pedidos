/**
 * Badges hardcodeadas (mismo set que el seed de la migración 0030).
 * Se usan para UI cuando no queremos round-trip al catálogo.
 */

import type { BadgeCriterio } from '@/lib/types/empleados'

export type BadgeStatic = {
  codigo: string
  nombre: string
  descripcion: string
  icono: string
  color: string
  criterio: BadgeCriterio
  puntos_bonus: number
}

export const BADGES: BadgeStatic[] = [
  {
    codigo: 'primer_paso',
    nombre: 'Primer paso',
    descripcion: 'Completá tu primera tarea',
    icono: 'Sparkles',
    color: '#22c55e',
    criterio: { tareas_completadas_minimo: 1 },
    puntos_bonus: 5,
  },
  {
    codigo: 'consistente',
    nombre: 'Consistente',
    descripcion: 'Completá 10 tareas',
    icono: 'CheckCheck',
    color: '#0ea5e9',
    criterio: { tareas_completadas_minimo: 10 },
    puntos_bonus: 20,
  },
  {
    codigo: 'pro',
    nombre: 'Pro',
    descripcion: 'Completá 100 tareas',
    icono: 'Award',
    color: '#f59e0b',
    criterio: { tareas_completadas_minimo: 100 },
    puntos_bonus: 100,
  },
  {
    codigo: 'maestro',
    nombre: 'Maestro',
    descripcion: 'Completá 500 tareas',
    icono: 'Crown',
    color: '#a855f7',
    criterio: { tareas_completadas_minimo: 500 },
    puntos_bonus: 500,
  },
  {
    codigo: 'super_responsable',
    nombre: 'Super responsable',
    descripcion: 'Completá tareas en SLA por 30 días seguidos',
    icono: 'ShieldCheck',
    color: '#16a34a',
    criterio: { streak_sla_dias: 30 },
    puntos_bonus: 150,
  },
  {
    codigo: 'tutor',
    nombre: 'Tutor',
    descripcion: 'Verificó 50 tareas correctamente',
    icono: 'GraduationCap',
    color: '#0891b2',
    criterio: { tareas_verificadas_minimo: 50 },
    puntos_bonus: 75,
  },
  {
    codigo: 'madrugador',
    nombre: 'Madrugador',
    descripcion: 'Completá 5 tareas antes de las 9 AM',
    icono: 'Sunrise',
    color: '#fbbf24',
    criterio: { completadas_antes_9am: 5 },
    puntos_bonus: 25,
  },
  {
    codigo: 'nocturno',
    nombre: 'Nocturno',
    descripcion: 'Completá 5 tareas después de las 21 hs',
    icono: 'Moon',
    color: '#6366f1',
    criterio: { completadas_despues_21: 5 },
    puntos_bonus: 25,
  },
  {
    codigo: 'limpieza_perfecta',
    nombre: 'Limpieza perfecta',
    descripcion: 'Completá 30 tareas de la categoría limpieza',
    icono: 'Sparkle',
    color: '#06b6d4',
    criterio: { tareas_categoria: { limpieza: 30 } },
    puntos_bonus: 50,
  },
  {
    codigo: 'compliance',
    nombre: 'Compliance total',
    descripcion: 'Completá todas las regulatorias del mes',
    icono: 'FileCheck',
    color: '#ef4444',
    criterio: { compliance_mes: true },
    puntos_bonus: 80,
  },
]

export const BADGE_BY_CODIGO: Record<string, BadgeStatic> = Object.fromEntries(
  BADGES.map((b) => [b.codigo, b]),
)
