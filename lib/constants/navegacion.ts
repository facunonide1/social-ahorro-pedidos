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

  equipo: {
    ...DEPARTAMENTOS_INFO.equipo,
    rolesPermitidos: ROLES_TODOS,
    submenu: [
      { label: 'Tareas',          path: '/admin/tareas',          icon: 'ListChecks',     badge: 'tareasPendientes', estado: 'activo' },
      { label: 'Mi panel',        path: '/admin/mi-panel',        icon: 'LayoutDashboard', estado: 'activo' },
      { label: 'Mi equipo',       path: '/admin/mi-equipo',       icon: 'UsersRound',     rolesRequeridos: ['super_admin','gerente','sucursal','administrativo','auditor'], estado: 'activo' },
      { label: 'Empleados',       path: '/admin/empleados',       icon: 'UserSquare2',    rolesRequeridos: ['super_admin','gerente','administrativo','auditor'], estado: 'activo' },
      { label: 'Objetivos',       path: '/admin/objetivos',       icon: 'Target',         rolesRequeridos: ['super_admin','gerente','administrativo','auditor'], estado: 'activo' },
      { label: 'Ranking',         path: '/admin/ranking',         icon: 'Trophy',         estado: 'activo' },
      { label: 'Reportes tareas', path: '/admin/tareas/reportes', icon: 'FileBarChart',   rolesRequeridos: ['super_admin','gerente','auditor'], estado: 'activo' },
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

// ============================================================================
// NAVEGACIÓN POR PILARES (F6.5.T3) — sidebar unificado de NORA HQ
// ============================================================================
//
// Reemplaza el modelo "departamento activo → submenú contextual" por un
// sidebar agrupado en 8 pilares, siempre visible y filtrado por rol. Los
// items apuntan a rutas reales de cualquier shell (/admin, /hub, /dashboard).

export type NavItem = {
  label: string
  href: string
  icon: LucideIconName
  /** Clave de contador para badge dinámico (el valor lo resuelve el sidebar). */
  badge?: string
  /** Default 'activo'. 'placeholder'/'fase2' muestran toast; 'externo' abre URL. */
  estado?: DeptEstado
  /** Roles que ven el item. Omitido = todos los roles. */
  rolesPermitidos?: AdminRole[]
}

export type NavGrupo = {
  grupo: string
  /** Si true, solo super_admin ve el grupo completo. */
  soloSuperAdmin?: boolean
  /** Roles que ven el grupo. Omitido = todos. */
  rolesPermitidos?: AdminRole[]
  items: NavItem[]
}

const ROLES_SUPERVISOR: AdminRole[] = ['super_admin', 'gerente', 'sucursal', 'administrativo', 'auditor']
const ROLES_GESTION_EQUIPO: AdminRole[] = ['super_admin', 'gerente', 'administrativo', 'auditor']

/**
 * Estructura del sidebar de NORA HQ. El item "Mission Control" va suelto
 * arriba (grupo de 1). Las rutas de `/admin/configuracion/*` que aún no
 * existen quedan en 'placeholder' hasta que su sub-tanda las cree.
 */
export const NAVEGACION: NavGrupo[] = [
  {
    grupo: 'Mission Control',
    items: [
      { label: 'Mission Control', href: '/admin', icon: 'LayoutDashboard' },
    ],
  },
  {
    grupo: 'Operación',
    items: [
      { label: 'Mi panel',       href: '/admin/mi-panel',                 icon: 'User' },
      { label: 'Mi equipo',      href: '/admin/mi-equipo',                icon: 'UsersRound', rolesPermitidos: ROLES_SUPERVISOR },
      { label: 'Tareas',         href: '/admin/tareas',                   icon: 'ListChecks', badge: 'tareasPendientes' },
      { label: 'Pedidos / CRM',  href: '/dashboard',                      icon: 'Package' },
      { label: 'Stock',          href: '/hub/operaciones/stock',          icon: 'Boxes' },
      { label: 'Vencimientos',   href: '/hub/operaciones/vencimientos',   icon: 'CalendarClock' },
      { label: 'Transferencias', href: '/hub/operaciones/transferencias', icon: 'ArrowRightLeft' },
      { label: 'Inventarios',    href: '/hub/operaciones/inventarios',    icon: 'ClipboardCheck' },
      { label: 'Caja diaria',    href: '/hub/sucursales/caja',            icon: 'Wallet' },
    ],
  },
  {
    grupo: 'Finanzas',
    rolesPermitidos: ROLES_FINANZAS,
    items: [
      { label: 'Cuentas y movimientos', href: '/hub/finanzas/cuentas',      icon: 'Building2' },
      { label: 'Facturas',              href: '/hub/facturas',              icon: 'FileText' },
      { label: 'Pagos',                 href: '/hub/pagos',                 icon: 'CreditCard' },
      { label: 'Cash flow',             href: '/hub/finanzas/cash-flow',    icon: 'TrendingUp' },
      { label: 'Conciliación',          href: '/hub/finanzas/conciliacion', icon: 'Scale' },
      { label: 'Cheques',               href: '/hub/finanzas/cheques',      icon: 'FileBadge' },
      { label: 'Impuestos',             href: '/hub/finanzas/impuestos',    icon: 'Receipt' },
      { label: 'Gastos operativos',     href: '/hub/sucursales/gastos',     icon: 'TrendingDown' },
    ],
  },
  {
    grupo: 'Compras',
    rolesPermitidos: ROLES_COMPRAS,
    items: [
      { label: 'Proveedores',  href: '/hub/proveedores',           icon: 'Truck' },
      { label: 'Recepciones',  href: '/hub/recepciones',           icon: 'PackageCheck' },
      { label: 'Devoluciones', href: '/hub/compras/devoluciones',  icon: 'Undo2' },
    ],
  },
  {
    grupo: 'Equipo',
    items: [
      { label: 'Empleados',    href: '/hub/rrhh/empleados',           icon: 'UserCheck', rolesPermitidos: ROLES_GESTION_EQUIPO },
      { label: 'Performance',  href: '/hub/sucursales/performance',   icon: 'BarChart3', rolesPermitidos: ROLES_SUPERVISOR },
      { label: 'Ranking',      href: '/admin/ranking',                icon: 'Trophy' },
      { label: 'Aprobaciones', href: '/hub/aprobaciones',             icon: 'CheckCircle2', badge: 'aprobacionesPendientes', rolesPermitidos: ROLES_SUPERVISOR },
    ],
  },
  {
    grupo: 'Clientes',
    items: [
      { label: 'Clientes B2B',       href: '/hub/clientes',   icon: 'Users' },
      { label: 'Validación tickets', href: '/hub/ia/tickets', icon: 'Ticket' },
    ],
  },
  {
    grupo: 'Inteligencia',
    rolesPermitidos: ROLES_TRANSV,
    items: [
      { label: 'Dashboard ejecutivo', href: '/hub/ejecutivo',  icon: 'LayoutGrid' },
      { label: 'BI / Reportes',       href: '/hub/bi',         icon: 'PieChart' },
      { label: 'Resumen IA del día',  href: '/hub/ia/resumen', icon: 'Sparkles' },
    ],
  },
  {
    grupo: 'Administración',
    soloSuperAdmin: true,
    items: [
      { label: 'Sucursales',            href: '/hub/sucursales',                       icon: 'Store' },
      { label: 'Usuarios y permisos',   href: '/admin/configuracion/usuarios',         icon: 'Shield' },
      { label: 'Catálogo de productos', href: '/admin/configuracion/catalogo',         icon: 'Package' },
      { label: 'Tipos de tareas',       href: '/admin/configuracion/tipos-tareas',     icon: 'ListChecks' },
      { label: 'Triggers automáticos',  href: '/admin/configuracion/triggers-tareas',  icon: 'Zap' },
      { label: 'Integraciones / APIs',  href: '/admin/configuracion/integraciones',    icon: 'Plug',      estado: 'placeholder' },
      { label: 'Configuración IA',      href: '/admin/configuracion/ia',               icon: 'Bot',       estado: 'placeholder' },
      { label: 'Auditoría',             href: '/admin/configuracion/auditoria',        icon: 'FileSearch', estado: 'placeholder' },
      { label: 'Configuración general', href: '/admin/configuracion/general',          icon: 'Settings',  estado: 'placeholder' },
    ],
  },
]

/** Filtra NAVEGACION según rol: grupos e items visibles. */
export function navegacionParaRol(rol: AdminRole | null): NavGrupo[] {
  if (!rol) return []
  const esSuper = rol === 'super_admin'
  return NAVEGACION
    .filter((g) => (g.soloSuperAdmin ? esSuper : true))
    .filter((g) => (g.rolesPermitidos ? g.rolesPermitidos.includes(rol) : true))
    .map((g) => ({
      ...g,
      items: g.items.filter((it) =>
        it.rolesPermitidos ? it.rolesPermitidos.includes(rol) : true,
      ),
    }))
    .filter((g) => g.items.length > 0)
}

/** Busca un item de NAVEGACION por href (favoritos / recientes). */
export function navItemPorHref(href: string): NavItem | null {
  for (const g of NAVEGACION) {
    const f = g.items.find((it) => it.href === href)
    if (f) return f
  }
  return null
}
