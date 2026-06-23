/**
 * Navegación de NORA HQ — sidebar de 9 sectores colapsables (v0.31).
 *
 * Un solo sistema: `NAVEGACION` (NavGrupo[]). Cada sector agrupa items por
 * `subsector` (sub-encabezado visual). El sidebar muestra los sectores
 * colapsables (el del item activo abierto). La visibilidad por item se resuelve
 * con el sistema de permisos finos (`navegacionParaUsuario` → `puede(modulo,'ver')`)
 * + `rolesPermitidos` opcional. Los href existentes NO cambian (solo se reagrupan).
 */

import type { AdminRole } from '@/lib/types/admin'
import type { DeptEstado } from '@/lib/constants/departamentos'
import { puede, type PermisoModulo, type PermisosCustom } from '@/lib/types/permisos'

export type LucideIconName = string

export type NavItem = {
  label: string
  href: string
  icon: LucideIconName
  /** Sub-encabezado dentro del sector (ej. "Depósito y stock"). Opcional. */
  subsector?: string
  /** Clave de contador para badge dinámico (el valor lo resuelve el sidebar). */
  badge?: string
  /** Default 'activo'. 'placeholder'/'fase2' muestran toast; 'externo' abre URL. */
  estado?: DeptEstado
  /** Roles que ven el item (además del permiso de módulo). Omitido = todos. */
  rolesPermitidos?: AdminRole[]
}

export type NavGrupo = {
  grupo: string
  /** Ícono del sector (encabezado colapsable). */
  icon?: LucideIconName
  /** Si true, solo super_admin ve el grupo completo. */
  soloSuperAdmin?: boolean
  /** Roles que ven el grupo. Omitido = todos. */
  rolesPermitidos?: AdminRole[]
  items: NavItem[]
}

const ROLES_SUPERVISOR: AdminRole[] = ['super_admin', 'gerente', 'sucursal', 'encargado_sucursal', 'administrativo', 'auditor']
const ROLES_GESTION_EQUIPO: AdminRole[] = ['super_admin', 'gerente', 'administrativo', 'rrhh', 'auditor']
const SOLO_SUPER: AdminRole[] = ['super_admin']

/** Los 9 sectores de NORA HQ. Los href existentes se conservan (solo se reagrupan). */
export const NAVEGACION: NavGrupo[] = [
  // ───────────────────────── 1 · INICIO ─────────────────────────
  {
    grupo: 'Inicio', icon: 'LayoutDashboard',
    items: [
      { label: 'Mission Control', href: '/admin',                          icon: 'LayoutDashboard' },
      { label: 'NORA',            href: '/admin/nora',                      icon: 'Sparkles' },
      { label: 'Feed de NORA',    href: '/admin/nora/feed',                 icon: 'Bot', badge: 'noraAvisosPendientes' },
      { label: 'Mi panel',        href: '/admin/mi-panel',                  icon: 'User' },
      { label: 'Mi bandeja',      href: '/admin/comunicacion/mi-bandeja',   icon: 'Megaphone' },
      { label: 'CRM Pedidos',     href: '/dashboard',                       icon: 'Package', subsector: 'Apps', estado: 'externo' },
      { label: 'Cuponera',        href: 'https://cuponera.socialahorro.com', icon: 'Ticket', subsector: 'Apps', estado: 'externo' },
    ],
  },
  // ───────────────────────── 2 · OPERACIÓN ─────────────────────────
  {
    grupo: 'Operación', icon: 'Boxes',
    items: [
      { label: 'Panel operaciones', href: '/admin/operaciones',               icon: 'LayoutGrid',     subsector: 'Depósito y stock' },
      { label: 'Stock',             href: '/admin/operaciones/stock',          icon: 'Boxes',          subsector: 'Depósito y stock' },
      { label: 'Transferencias',    href: '/admin/operaciones/transferencias', icon: 'ArrowRightLeft', subsector: 'Depósito y stock' },
      { label: 'Vencimientos',      href: '/admin/operaciones/vencimientos',   icon: 'CalendarClock',  subsector: 'Depósito y stock' },
      { label: 'Inventarios',       href: '/admin/operaciones/inventarios',    icon: 'ClipboardCheck', subsector: 'Depósito y stock' },
      { label: 'Tareas',            href: '/admin/tareas',                     icon: 'ListChecks',     subsector: 'Tareas', badge: 'tareasPendientes' },
      { label: 'Verificaciones',    href: '/admin/verificaciones',             icon: 'CheckCircle2',   subsector: 'Tareas', badge: 'verificacionesPendientes' },
    ],
  },
  // ───────────────────────── 3 · COMPRAS ─────────────────────────
  {
    grupo: 'Compras', icon: 'ShoppingCart',
    items: [
      { label: 'Tablero',               href: '/admin/compras',                icon: 'LayoutGrid',    subsector: 'Decidir' },
      { label: 'Qué comprar',           href: '/admin/compras/recomendaciones', icon: 'Sparkles',     subsector: 'Decidir' },
      { label: 'Avisos de faltantes',   href: '/admin/compras/faltantes',      icon: 'AlertTriangle', subsector: 'Decidir', badge: 'faltantesPendientes' },
      { label: 'Comparador de precios', href: '/admin/compras/comparador',     icon: 'Scale',         subsector: 'Decidir' },
      { label: 'Órdenes de compra',     href: '/admin/compras/ordenes',        icon: 'ShoppingCart',  subsector: 'Gestionar' },
      { label: 'Recepciones',           href: '/admin/compras/recepciones',    icon: 'PackageCheck',  subsector: 'Gestionar' },
      { label: 'Devoluciones',          href: '/admin/compras/devoluciones',   icon: 'Undo2',         subsector: 'Gestionar' },
      { label: 'Listas de precios',     href: '/admin/compras/listas-precios', icon: 'FileText',      subsector: 'Datos' },
      { label: 'Proveedores',           href: '/admin/proveedores',            icon: 'Truck',         subsector: 'Datos' },
    ],
  },
  // ───────────────────────── 4 · FINANZAS ─────────────────────────
  {
    grupo: 'Finanzas', icon: 'Wallet',
    items: [
      { label: 'Caja / arqueos',        href: '/admin/finanzas/caja',         icon: 'Wallet',       subsector: 'Caja' },
      { label: 'Gastos operativos',     href: '/admin/sucursales/gastos',     icon: 'Receipt',      subsector: 'Caja' },
      { label: 'Tablero',               href: '/admin/finanzas',              icon: 'LayoutGrid',   subsector: 'Pagos' },
      { label: 'Documentos a pagar',    href: '/admin/finanzas/documentos',   icon: 'FileText',     subsector: 'Pagos' },
      { label: 'Pagos',                 href: '/admin/finanzas/pagos',        icon: 'CreditCard',   subsector: 'Pagos' },
      { label: 'Gastos fijos',          href: '/admin/finanzas/gastos-fijos', icon: 'Repeat',       subsector: 'Pagos' },
      { label: 'Cheques',               href: '/admin/finanzas/cheques',      icon: 'FileBadge',    subsector: 'Pagos' },
      { label: 'Calendario de pagos',   href: '/admin/finanzas/calendario',   icon: 'CalendarDays', subsector: 'Pagos' },
      { label: 'Cuentas y movimientos', href: '/admin/finanzas/cuentas',      icon: 'Building2',    subsector: 'Bancos' },
      { label: 'Conciliación',          href: '/admin/finanzas/conciliacion', icon: 'Scale',        subsector: 'Bancos' },
      { label: 'Cash flow',             href: '/admin/finanzas/cash-flow',    icon: 'TrendingUp',   subsector: 'Bancos' },
      { label: 'Impuestos',             href: '/admin/finanzas/impuestos',    icon: 'Receipt',      subsector: 'Bancos' },
    ],
  },
  // ───────────────────────── 5 · COMERCIAL ─────────────────────────
  {
    grupo: 'Comercial', icon: 'Tag',
    items: [
      { label: 'Ofertas',                href: '/admin/ofertas',                   icon: 'Tag',       subsector: 'Ofertas' },
      { label: 'Propuestas de NORA',     href: '/admin/ofertas/propuestas',        icon: 'Sparkles',  subsector: 'Ofertas' },
      { label: 'Calendario',             href: '/admin/ofertas/calendario',        icon: 'CalendarDays', subsector: 'Ofertas' },
      { label: 'Rendimiento',            href: '/admin/ofertas/rendimiento',       icon: 'BarChart3', subsector: 'Ofertas' },
      { label: 'Para ofrecer',           href: '/admin/ofertas/panel',             icon: 'Megaphone', subsector: 'Ofertas' },
      { label: 'Clientes',               href: '/admin/clientes',                  icon: 'Users',     subsector: 'Clientes (CRM)' },
      { label: 'Segmentos',              href: '/admin/clientes/segmentos',        icon: 'PieChart',  subsector: 'Clientes (CRM)' },
      { label: 'B2B',                    href: '/admin/clientes/b2b',              icon: 'Building2', subsector: 'Clientes (CRM)' },
      { label: 'Puntos',                 href: '/admin/clientes/puntos',           icon: 'Coins',     subsector: 'Clientes (CRM)' },
      { label: 'Automatizaciones',       href: '/admin/clientes/automatizaciones', icon: 'Repeat',    subsector: 'Clientes (CRM)' },
      { label: 'Comunicación a clientes', href: '/admin/clientes/comunicacion',    icon: 'Megaphone', subsector: 'Campañas' },
      { label: 'Validación de tickets',  href: '/admin/ia/tickets',                icon: 'Ticket',    subsector: 'Campañas' },
    ],
  },
  // ───────────────────────── 6 · EQUIPO (RRHH) ─────────────────────────
  {
    grupo: 'Equipo', icon: 'UserCheck',
    items: [
      { label: 'Resumen',      href: '/admin/rrhh',           icon: 'LayoutGrid' },
      { label: 'Empleados',    href: '/admin/rrhh/empleados',  icon: 'UserCheck', rolesPermitidos: ROLES_GESTION_EQUIPO },
      { label: 'Mi equipo',    href: '/admin/mi-equipo',       icon: 'UsersRound', rolesPermitidos: ROLES_SUPERVISOR },
      { label: 'Ranking',      href: '/admin/ranking',         icon: 'Trophy' },
      { label: 'Objetivos',    href: '/admin/objetivos',       icon: 'Target' },
      { label: 'Aprobaciones', href: '/admin/aprobaciones',    icon: 'CheckCircle2', badge: 'aprobacionesPendientes', rolesPermitidos: ROLES_SUPERVISOR },
    ],
  },
  // ───────────────────────── 7 · COMUNICACIÓN INTERNA ─────────────────────────
  {
    grupo: 'Comunicación interna', icon: 'MessageSquare',
    items: [
      { label: 'Inbox',       href: '/admin/comunicacion',             icon: 'MessageSquare', badge: 'mensajesNoLeidos' },
      { label: 'Comunicados', href: '/admin/comunicacion/comunicados', icon: 'CheckCheck' },
    ],
  },
  // ───────────────────────── 8 · INTELIGENCIA ─────────────────────────
  {
    grupo: 'Inteligencia', icon: 'BarChart3',
    items: [
      { label: 'BI / Reportes',            href: '/admin/bi',                     icon: 'PieChart' },
      { label: 'Resumen IA del día',       href: '/admin/ia/resumen',             icon: 'Sparkles' },
      { label: 'Panel IA',                 href: '/admin/ia',                     icon: 'LayoutGrid' },
      { label: 'Performance de sucursales', href: '/admin/sucursales/performance', icon: 'Activity', rolesPermitidos: ROLES_SUPERVISOR },
      { label: 'Listado de sucursales',    href: '/admin/sucursales',             icon: 'Store', rolesPermitidos: ['super_admin', 'gerente'] },
    ],
  },
  // ───────────────────────── 9 · SISTEMA ─────────────────────────
  {
    grupo: 'Sistema', icon: 'Settings',
    items: [
      { label: 'Centro de Datos', href: '/admin/centro-datos',               icon: 'Database',    subsector: 'Centro de Datos (SIFACO)' },
      { label: 'Importar',        href: '/admin/centro-datos/importar',       icon: 'Upload',      subsector: 'Centro de Datos (SIFACO)' },
      { label: 'Exportar',        href: '/admin/centro-datos/exportar',       icon: 'Download',    subsector: 'Centro de Datos (SIFACO)' },
      { label: 'Ventas diarias',  href: '/admin/centro-datos/ventas-diarias', icon: 'ShoppingBag', subsector: 'Centro de Datos (SIFACO)' },
      { label: 'Perfiles',        href: '/admin/centro-datos/perfiles',       icon: 'Layers',      subsector: 'Centro de Datos (SIFACO)' },
      { label: 'Historial',       href: '/admin/centro-datos/historial',      icon: 'History',     subsector: 'Centro de Datos (SIFACO)' },
      { label: 'Sin matchear',    href: '/admin/centro-datos/sin-matchear',   icon: 'AlertCircle', subsector: 'Centro de Datos (SIFACO)', badge: 'sinMatchearPendientes' },
      { label: 'Usuarios y permisos',   href: '/admin/configuracion/usuarios',     icon: 'Shield',     subsector: 'Administración', rolesPermitidos: SOLO_SUPER },
      { label: 'Catálogo de productos', href: '/admin/configuracion/catalogo',     icon: 'Package',    subsector: 'Administración', rolesPermitidos: SOLO_SUPER },
      { label: 'Tipos de tareas',       href: '/admin/configuracion/tipos-tareas', icon: 'ListChecks', subsector: 'Administración', rolesPermitidos: SOLO_SUPER },
      { label: 'Recurrencias',          href: '/admin/configuracion/recurrencias', icon: 'Repeat',     subsector: 'Administración', rolesPermitidos: SOLO_SUPER },
      { label: 'Turnos',                href: '/admin/configuracion/turnos',       icon: 'Clock',      subsector: 'Administración', rolesPermitidos: SOLO_SUPER },
      { label: 'Supervisores',          href: '/admin/configuracion/supervisores', icon: 'UserCheck',  subsector: 'Administración', rolesPermitidos: SOLO_SUPER },
      { label: 'Datos demo',            href: '/admin/configuracion/general',      icon: 'Database',   subsector: 'Administración', rolesPermitidos: SOLO_SUPER },
      { label: 'Configuración general', href: '/admin/configuracion/general',      icon: 'Settings',   subsector: 'Administración', rolesPermitidos: SOLO_SUPER },
    ],
  },
]

/** Filtra NAVEGACION según rol legacy (super_admin ve todo, respeta rolesPermitidos). */
export function navegacionParaRol(rol: AdminRole | null): NavGrupo[] {
  if (!rol) return []
  const esSuper = rol === 'super_admin'
  return NAVEGACION
    .filter((g) => (g.soloSuperAdmin ? esSuper : true))
    .filter((g) => (g.rolesPermitidos ? g.rolesPermitidos.includes(rol) : true))
    .map((g) => ({
      ...g,
      items: g.items.filter((it) => (it.rolesPermitidos ? it.rolesPermitidos.includes(rol) : true)),
    }))
    .filter((g) => g.items.length > 0)
}

/**
 * Mapea un href de NAVEGACION a su módulo de permisos. El orden importa:
 * los prefijos más específicos (ej. caja) van antes que los generales (finanzas).
 * Devuelve null si el item no está gobernado por permisos (links externos).
 */
export function moduloDeHref(href: string): PermisoModulo | null {
  if (href === '/admin') return 'mission_control'
  const reglas: [string, PermisoModulo][] = [
    ['/admin/nora', 'mission_control'],
    ['/admin/comunicacion', 'comunicacion'],
    ['/admin/centro-datos', 'centro_datos'],
    ['/admin/finanzas/caja', 'caja'],
    ['/admin/finanzas', 'finanzas'],
    ['/admin/compras', 'compras'],
    ['/admin/proveedores', 'compras'],
    ['/admin/recepciones', 'compras'],
    ['/admin/operaciones', 'operaciones'],
    ['/admin/ofertas', 'ofertas'],
    ['/admin/ia/tickets', 'clientes'],
    ['/admin/clientes', 'clientes'],
    ['/admin/sucursales/gastos', 'caja'],
    ['/admin/sucursales', 'sucursales'],
    ['/admin/rrhh', 'rrhh'],
    ['/admin/aprobaciones', 'aprobaciones'],
    ['/admin/bi', 'bi'],
    ['/admin/ia', 'ia'],
    ['/admin/configuracion', 'configuracion'],
    ['/admin/verificaciones', 'tareas'],
    ['/admin/tareas', 'tareas'],
    ['/admin/mi-panel', 'tareas'],
    ['/admin/mi-equipo', 'tareas'],
    ['/admin/objetivos', 'tareas'],
    ['/admin/ranking', 'tareas'],
  ]
  for (const [prefijo, modulo] of reglas) {
    if (href === prefijo || href.startsWith(prefijo + '/')) return modulo
  }
  return null
}

/**
 * Filtra NAVEGACION por permisos finos reales (rol + overrides). Un item se ve
 * si `puede(modulo, 'ver')` Y (sin `rolesPermitidos` o el rol está incluido).
 * Los items sin módulo (links externos) se muestran siempre. super_admin ve todo.
 */
export function navegacionParaUsuario(rol: AdminRole | null, custom?: PermisosCustom | null): NavGrupo[] {
  if (!rol) return []
  if (rol === 'super_admin') return navegacionParaRol(rol)
  return NAVEGACION
    .map((g) => ({
      ...g,
      items: g.items.filter((it) => {
        if (it.rolesPermitidos && !it.rolesPermitidos.includes(rol)) return false
        if (it.estado === 'externo') return true
        const modulo = moduloDeHref(it.href)
        if (!modulo) return true
        return puede(rol, custom ?? null, modulo, 'ver')
      }),
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
