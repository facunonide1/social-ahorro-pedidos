import type { Departamento } from '@/lib/types/admin'
import { DEPARTAMENTOS_ORDER } from '@/lib/constants/departamentos'

const DEFAULT_DEPT: Departamento = 'ejecutivo'

/**
 * Rutas top-level que pertenecen al departamento `equipo` (sistema de
 * tareas + gestión de empleados, F6).
 */
const EQUIPO_PATHS = new Set([
  'tareas',
  'mi-panel',
  'mi-equipo',
  'empleados',
  'objetivos',
  'ranking',
])

/**
 * Deriva qué departamento del ERP está activo a partir del pathname.
 *
 *   /admin               → 'ejecutivo'
 *   /admin/tareas/*      → 'equipo'
 *   /admin/mi-panel      → 'equipo'
 *   /admin/compras/*     → 'compras'
 *   /admin/finanzas/*    → 'finanzas'
 *   /admin/sucursales/*  → 'sucursales'
 *   ...
 *   /admin/cualquier-otra-cosa → 'ejecutivo' (fallback)
 *   /hub/* (legacy)      → 'ejecutivo' (no es una ruta del ERP nuevo)
 */
export function deptFromPath(pathname: string): Departamento {
  if (!pathname.startsWith('/admin')) return DEFAULT_DEPT
  const rest = pathname.slice('/admin'.length).replace(/^\/+/, '')
  if (rest === '') return DEFAULT_DEPT
  const first = rest.split('/')[0]
  if (EQUIPO_PATHS.has(first)) return 'equipo'
  const match = DEPARTAMENTOS_ORDER.find((d) => d === first)
  return (match as Departamento | undefined) ?? DEFAULT_DEPT
}
