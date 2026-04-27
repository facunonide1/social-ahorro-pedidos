/**
 * Navegación declarativa del Admin Hub (ERP).
 *
 * Cada departamento tiene un submenú con sus rutas. El `estado` de
 * cada item determina si es navegable o muestra un toast informativo:
 *
 * - 'activo'      → ruta real, click navega.
 * - 'placeholder' → muestra toast "En construcción".
 * - 'fase2'       → muestra toast "Disponible en fase 2".
 * - 'externo'     → abre URL externa en nueva pestaña.
 */

import type { AdminRole, Departamento } from '@/lib/types/admin'
import {
  DEPARTAMENTOS_INFO,
  type DeptEstado,
  type DeptInfo,
} from '@/lib/constants/departamentos'

export type LucideIconName = string

export type SubmenuItem = {
  label: string
  path: string
  icon: LucideIconName
  /** Clave de un contador (ej: 'pedidosPendientes') para badge dinámico. */
  badge?: string
  rolesRequeridos?: AdminRole[]
  estado: DeptEstado
}

export type DepartamentoNav = DeptInfo & {
  rolesPermitidos: AdminRole[]
  submenu: SubmenuItem[]
}

/**
 * Roles legacy v1 que pueden ver cada departamento. Cuando llegue el
 * refactor v2, esto pasa a inferirse de `rol_departamento`.
 */
const ROLES_TODOS: AdminRole[] = [
  'super_admin', 'gerente', 'comprador', 'administrativo',
  'tesoreria', 'auditor', 'sucursal',
]
const ROLES_TRANSV: AdminRole[] = ['super_admin', 'gerente', 'auditor']
const ROLES_COMPRAS: AdminRole[] = ['super_admin', 'gerente', 'comprador', 'auditor']
const ROLES_FINANZAS: AdminRole[] = ['super_admin', 'gerente', 'tesoreria', 'administrativo', 'auditor']
const ROLES_SUCURSAL: AdminRole[] = ['super_admin', 'gerente', 'sucursal', 'administrativo', 'auditor']

export const NAVEGACION_DEPARTAMENTAL: Record<Departamento, DepartamentoNav> = {
  ejecutivo: {
    ...DEPARTAMENTOS_INFO.ejecutivo,
    rolesPermitidos: ROLES_TRANSV,
    submenu: [
      { label: 'Dashboard ejecutivo',  path: '/admin',                icon: 'LayoutDashboard', estado: 'activo' },
      { label: 'Centro de aprobaciones', path: '/admin/aprobaciones', icon: 'CheckCircle2',    estado: 'placeholder' },
      { label: 'Reportes globales',    path: '/admin/reportes',       icon: 'FileBarChart',    estado: 'placeholder' },
    ],
  },

  compras: {
    ...DEPARTAMENTOS_INFO.compras,
    rolesPermitidos: ROLES_COMPRAS,
    submenu: [
      { label: 'Dashboard',            path: '/admin/compras',              icon: 'LayoutGrid',    estado: 'placeholder' },
      { label: 'Proveedores',          path: '/admin/compras/proveedores',  icon: 'Building2',     estado: 'placeholder' },
      { label: 'Pedidos',              path: '/admin/compras/pedidos',      icon: 'ClipboardList', badge: 'pedidosPendientes', estado: 'placeholder' },
      { label: 'Recepciones',          path: '/admin/compras/recepciones',  icon: 'PackageCheck',  estado: 'placeholder' },
      { label: 'Devoluciones',         path: '/admin/compras/devoluciones', icon: 'PackageX',      estado: 'placeholder' },
      { label: 'Comparativa precios',  path: '/admin/compras/precios',      icon: 'TrendingUp',    estado: 'fase2' },
    ],
  },

  finanzas: {
    ...DEPARTAMENTOS_INFO.finanzas,
    rolesPermitidos: ROLES_FINANZAS,
    submenu: [
      { label: 'Dashboard financiero', path: '/admin/finanzas',              icon: 'LayoutGrid',    estado: 'placeholder' },
      { label: 'Facturas a pagar',     path: '/admin/finanzas/facturas',     icon: 'FileText',      badge: 'facturasPendientes', estado: 'placeholder' },
      { label: 'Pagos',                path: '/admin/finanzas/pagos',        icon: 'Banknote',      estado: 'placeholder' },
      { label: 'Cuentas bancarias',    path: '/admin/finanzas/cuentas',      icon: 'Landmark',      estado: 'fase2' },
      { label: 'Conciliación',         path: '/admin/finanzas/conciliacion', icon: 'GitMerge',      estado: 'fase2' },
      { label: 'Cash flow',            path: '/admin/finanzas/cash-flow',    icon: 'LineChart',     estado: 'fase2' },
      { label: 'Impuestos',            path: '/admin/finanzas/impuestos',    icon: 'Calculator',    estado: 'fase2' },
    ],
  },

  sucursales: {
    ...DEPARTAMENTOS_INFO.sucursales,
    rolesPermitidos: ROLES_SUCURSAL,
    submenu: [
      { label: 'Dashboard',         path: '/admin/sucursales',             icon: 'LayoutGrid',  estado: 'placeholder' },
      { label: 'Listado',           path: '/admin/sucursales/listado',     icon: 'Building2',   estado: 'placeholder' },
      { label: 'Performance',       path: '/admin/sucursales/performance', icon: 'Activity',    estado: 'placeholder' },
      { label: 'Caja diaria',       path: '/admin/sucursales/caja',        icon: 'Wallet',      estado: 'fase2' },
      { label: 'Gastos operativos', path: '/admin/sucursales/gastos',      icon: 'Receipt',     estado: 'fase2' },
    ],
  },

  operaciones: {
    ...DEPARTAMENTOS_INFO.operaciones,
    rolesPermitidos: ROLES_TODOS, // todos visualizan; submenú todo en fase2
    submenu: [
      { label: 'Stock e inventario', path: '/admin/operaciones/stock',           icon: 'Boxes',        estado: 'fase2' },
      { label: 'Transferencias',     path: '/admin/operaciones/transferencias',  icon: 'ArrowRightLeft', estado: 'fase2' },
      { label: 'Vencimientos',       path: '/admin/operaciones/vencimientos',    icon: 'CalendarClock', estado: 'fase2' },
    ],
  },

  comercial: {
    ...DEPARTAMENTOS_INFO.comercial,
    rolesPermitidos: ROLES_TODOS,
    submenu: [
      { label: 'Promociones', path: 'https://cuponera.socialahorro.com',          icon: 'Megaphone',   estado: 'externo' },
      { label: 'Comunicación', path: 'https://cuponera.socialahorro.com/mensajes', icon: 'MessageSquare', estado: 'externo' },
    ],
  },

  clientes: {
    ...DEPARTAMENTOS_INFO.clientes,
    rolesPermitidos: ROLES_TODOS,
    submenu: [
      { label: 'Maestro de clientes', path: 'https://cuponera.socialahorro.com/clientes', icon: 'Users',  estado: 'externo' },
      { label: 'Segmentación',         path: 'https://cuponera.socialahorro.com/segmentos', icon: 'PieChart', estado: 'externo' },
    ],
  },

  rrhh: {
    ...DEPARTAMENTOS_INFO.rrhh,
    rolesPermitidos: ROLES_TRANSV,
    submenu: [
      { label: 'Empleados',  path: '/admin/rrhh/empleados', icon: 'UserSquare2', estado: 'fase2' },
      { label: 'Turnos',     path: '/admin/rrhh/turnos',    icon: 'CalendarDays', estado: 'fase2' },
      { label: 'Ausencias',  path: '/admin/rrhh/ausencias', icon: 'CalendarX',   estado: 'fase2' },
      { label: 'Sueldos',    path: '/admin/rrhh/sueldos',   icon: 'DollarSign',  estado: 'fase2' },
    ],
  },

  bi: {
    ...DEPARTAMENTOS_INFO.bi,
    rolesPermitidos: ROLES_TRANSV,
    submenu: [
      { label: 'Reportes',    path: '/admin/bi/reportes',    icon: 'FileBarChart', estado: 'fase2' },
      { label: 'Dashboards',  path: '/admin/bi/dashboards',  icon: 'BarChart3',    estado: 'fase2' },
      { label: 'Exploración', path: '/admin/bi/exploracion', icon: 'Search',       estado: 'fase2' },
    ],
  },
}

/** Lista plana de departamentos visibles para un rol legacy v1. */
export function departamentosPermitidos(rol: AdminRole | null): DepartamentoNav[] {
  if (!rol) return []
  return Object.values(NAVEGACION_DEPARTAMENTAL).filter((d) => d.rolesPermitidos.includes(rol))
}
