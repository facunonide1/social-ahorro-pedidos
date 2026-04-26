/**
 * Configuración declarativa de la navegación del Admin (ERP).
 *
 * **Placeholder de T-B**: por ahora solo expone la forma de las
 * estructuras y un objeto vacío. La configuración completa con cada
 * submenú, badges y rolesPermitidos se llena en T-C cuando se construya
 * el TopNav y el Sidebar contextual.
 */

import type { Departamento, AdminRole } from '@/lib/types/admin'

/** Nombre simbólico de un icono Lucide. Se resuelve en el render. */
export type LucideIconName = string

export type SubmenuItem = {
  label: string
  path: string
  icon?: LucideIconName
  /** Clave de un contador del store (ej: 'pedidosPendientes') para badge. */
  badge?: string
  /** Si está vacío, hereda los del padre. */
  rolesPermitidos?: AdminRole[]
}

export type DepartamentoNav = {
  id: Departamento
  label: string
  icon: LucideIconName
  /** Path raíz del departamento, ej: '/compras'. */
  path: string
  rolesPermitidos: AdminRole[]
  submenu: SubmenuItem[]
}

/** Por ahora vacío. T-C lo completa. */
export const NAVEGACION_DEPARTAMENTAL: Partial<Record<Departamento, DepartamentoNav>> = {}

/** Helper: lista plana de departamentos visibles para un rol. */
export function departamentosPermitidos(rol: AdminRole | null): DepartamentoNav[] {
  if (!rol) return []
  return Object.values(NAVEGACION_DEPARTAMENTAL)
    .filter((d): d is DepartamentoNav => Boolean(d))
    .filter((d) => d.rolesPermitidos.includes(rol))
}
