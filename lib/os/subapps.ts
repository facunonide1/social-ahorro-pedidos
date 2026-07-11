/**
 * NORA OS · Contrato de sub-app + registry (v0.37-os-shell).
 *
 * Re-carcasa sobre la app existente: NO reescribe ningún sector. Cada sub-app
 * mapea a las **rutas reales** que ya existen en `/admin`. La visibilidad se
 * resuelve con el sistema de permisos 18×5 existente (`puede(modulo, 'ver')`).
 *
 * Este archivo es CLIENT-SAFE (solo datos + tipos): no importa nada server-only.
 * Los `badge` reciben un cliente Supabase por parámetro (los invoca el endpoint
 * `/api/os/badges` server-side), así el registry se puede importar desde el dock
 * (cliente) y desde el server sin fricción.
 */

import type { AdminRole } from '@/lib/types/admin'
import { puede, type PermisoModulo, type PermisoAccion, type PermisosCustom } from '@/lib/types/permisos'

export type BadgeSeveridad = 'info' | 'warn' | 'danger'
export type BadgeResult = { count: number; severidad: BadgeSeveridad } | null

/** Cliente Supabase mínimo que necesitan los badges (evita acoplar tipos). */
type SbLike = { from: (t: string) => any }

export type QuickAction = {
  id: string
  nombre: string
  /** Ícono lucide (por nombre, resuelto por `<Icon>`). */
  icono: string
  /** Ruta destino (pantalla/modal existente). '#' si es `proximamente`. */
  destino: string
  /** Permiso que habilita ejecutarla (módulo + acción). Omitido = todos. */
  modulo?: PermisoModulo
  accion?: PermisoAccion
  /** Restricción extra por rol (además del permiso). */
  roles?: AdminRole[]
  /** Aparece en el nivel 1 (contextual) del menú "+". */
  primary?: boolean
  /** Aún no construida: se muestra deshabilitada con tooltip. */
  proximamente?: boolean
  children?: QuickAction[]
}

export type SubAppManifest = {
  id: string
  nombre: string
  icono: string
  /** Acento de la sub-app (hex) para chips/estados. */
  acento: string
  descripcion: string
  rutaHome: string
  modulos: { nombre: string; ruta: string }[]
  navInterna: 'tabs' | 'sidebar'
  /** Módulos de permisos que habilitan ver la sub-app (OR: alcanza con uno). */
  permisosRequeridos: PermisoModulo[]
  /** Restricción extra por rol (además de permisos). */
  rolesPermitidos?: AdminRole[]
  /** Badge vivo (server-side): recibe el cliente y el userId. Barato o null. */
  badge?: (sb: SbLike, userId: string, rol: AdminRole) => Promise<BadgeResult>
  quickActions: QuickAction[]
  /** Registrada pero NO mostrada (sub-apps del catálogo aún no construidas). */
  proximamente?: boolean
  /** Abre en app externa (link ↗). */
  externo?: boolean
}

// ───────────── helpers de fecha (AR) para badges ─────────────
function hoyISO(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date())
}
function enDiasISO(dias: number): string {
  const d = new Date(Date.now() + dias * 86_400_000)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(d)
}
async function cuenta(q: any): Promise<number> {
  const { count } = await q
  return count ?? 0
}

const ROLES_IRREG: AdminRole[] = ['super_admin', 'gerente', 'auditor', 'administrativo', 'tesoreria']

// ───────────────────────── Registry ─────────────────────────
export const SUBAPPS: SubAppManifest[] = [
  {
    id: 'tareas',
    nombre: 'Tareas',
    icono: 'ListChecks',
    acento: '#2EE1A8',
    descripcion: 'Tu día, verificaciones y agenda del equipo',
    rutaHome: '/admin/tareas',
    navInterna: 'tabs',
    permisosRequeridos: ['tareas'],
    modulos: [
      { nombre: 'Mi panel', ruta: '/admin/mi-panel' },
      { nombre: 'Tareas', ruta: '/admin/tareas' },
      { nombre: 'Agenda del día', ruta: '/admin/tareas/agenda' },
      { nombre: 'Reportes', ruta: '/admin/tareas/reportes' },
      { nombre: 'Verificaciones', ruta: '/admin/verificaciones' },
    ],
    badge: async (sb, userId, rol) => {
      // Mis tareas activas + las que me toca verificar (OS-2a · C).
      const propias = await cuenta(sb.from('tareas').select('id', { count: 'exact', head: true })
        .eq('responsable_id', userId).in('estado', ['pendiente', 'reclamada', 'en_progreso', 'rechazada']))
      let verif = 0
      if (['super_admin', 'gerente', 'auditor'].includes(rol)) {
        verif = await cuenta(sb.from('tareas').select('id', { count: 'exact', head: true }).eq('estado', 'en_verificacion'))
      } else {
        const { data: sups } = await sb.from('supervisores_tareas').select('sucursal_id').eq('user_id', userId).eq('activo', true)
        const ids = (sups ?? []).map((s: any) => s.sucursal_id)
        if (ids.length > 0) {
          verif = await cuenta(sb.from('tareas').select('id', { count: 'exact', head: true }).eq('estado', 'en_verificacion').in('sucursal_id', ids))
        }
      }
      const n = propias + verif
      return n > 0 ? { count: n, severidad: 'warn' } : null
    },
    quickActions: [
      { id: 'tarea-nueva', nombre: 'Crear tarea', icono: 'ListPlus', destino: '/admin/tareas', modulo: 'tareas', accion: 'crear', primary: true },
      { id: 'verificar', nombre: 'Verificar tareas', icono: 'CheckCircle2', destino: '/admin/verificaciones', modulo: 'tareas', accion: 'aprobar' },
    ],
  },
  {
    id: 'stock',
    nombre: 'Stock',
    icono: 'Boxes',
    acento: '#6E3CDB',
    descripcion: 'Depósito, vencimientos, transferencias e inventarios',
    rutaHome: '/admin/operaciones',
    navInterna: 'sidebar',
    permisosRequeridos: ['operaciones'],
    modulos: [
      { nombre: 'Panel', ruta: '/admin/operaciones' },
      { nombre: 'Stock', ruta: '/admin/operaciones/stock' },
      { nombre: 'Transferencias', ruta: '/admin/operaciones/transferencias' },
      { nombre: 'Vencimientos', ruta: '/admin/operaciones/vencimientos' },
      { nombre: 'Recartelado', ruta: '/admin/operaciones/recartelado' },
      { nombre: 'Inventarios', ruta: '/admin/operaciones/inventarios' },
      { nombre: 'Control por zonas', ruta: '/admin/operaciones/control-zonas' },
      { nombre: 'Alertas', ruta: '/admin/operaciones/alertas' },
      { nombre: 'Análisis', ruta: '/admin/operaciones/analisis' },
      { nombre: 'Reposición', ruta: '/admin/operaciones/reposicion' },
      { nombre: 'Irregularidades', ruta: '/admin/operaciones/irregularidades' },
    ],
    badge: async (sb) => {
      // Vencimientos vigentes que caen en los próximos 30 días.
      const n = await cuenta(sb.from('vencimientos').select('id', { count: 'exact', head: true })
        .eq('estado', 'vigente').lte('fecha_vencimiento', enDiasISO(30)))
      return n > 0 ? { count: n, severidad: 'warn' } : null
    },
    quickActions: [
      { id: 'transferencia-nueva', nombre: 'Nueva transferencia', icono: 'ArrowRightLeft', destino: '/admin/operaciones/transferencias/nueva', modulo: 'operaciones', accion: 'crear', primary: true },
      { id: 'stock-cargar', nombre: 'Cargar producto', icono: 'PackagePlus', destino: '/admin/operaciones/stock/nuevo', modulo: 'operaciones', accion: 'crear' },
      { id: 'inventario', nombre: 'Inventarios', icono: 'ClipboardCheck', destino: '/admin/operaciones/inventarios', modulo: 'operaciones', accion: 'crear' },
    ],
  },
  {
    id: 'compras',
    nombre: 'Compras',
    icono: 'ShoppingCart',
    acento: '#F59E0B',
    descripcion: 'Proveedores, órdenes, recepciones y precios',
    rutaHome: '/admin/compras',
    navInterna: 'sidebar',
    permisosRequeridos: ['compras'],
    modulos: [
      { nombre: 'Tablero', ruta: '/admin/compras' },
      { nombre: 'Qué comprar', ruta: '/admin/compras/recomendaciones' },
      { nombre: 'Avisos de faltantes', ruta: '/admin/compras/faltantes' },
      { nombre: 'Comparador de precios', ruta: '/admin/compras/comparador' },
      { nombre: 'Órdenes de compra', ruta: '/admin/compras/ordenes' },
      { nombre: 'Recepciones', ruta: '/admin/compras/recepciones' },
      { nombre: 'Devoluciones', ruta: '/admin/compras/devoluciones' },
      { nombre: 'Listas de precios', ruta: '/admin/compras/listas-precios' },
      { nombre: 'Proveedores', ruta: '/admin/proveedores' },
    ],
    badge: async (sb) => {
      const n = await cuenta(sb.from('avisos_faltante').select('id', { count: 'exact', head: true }).eq('estado', 'nuevo'))
      return n > 0 ? { count: n, severidad: 'warn' } : null
    },
    quickActions: [
      { id: 'orden-nueva', nombre: 'Nueva orden de compra', icono: 'ShoppingCart', destino: '/admin/compras/ordenes/nueva', modulo: 'compras', accion: 'crear', primary: true },
      { id: 'faltante', nombre: 'Cargar un faltante', icono: 'AlertTriangle', destino: '/admin/compras/faltantes', modulo: 'compras', accion: 'crear' },
    ],
  },
  {
    id: 'finanzas',
    nombre: 'Finanzas',
    icono: 'Wallet',
    acento: '#10B981',
    descripcion: 'Caja, pagos, documentos y tesorería',
    rutaHome: '/admin/finanzas',
    navInterna: 'sidebar',
    permisosRequeridos: ['finanzas', 'caja'],
    modulos: [
      { nombre: 'Tablero', ruta: '/admin/finanzas' },
      { nombre: 'Caja / arqueos', ruta: '/admin/finanzas/caja' },
      { nombre: 'Documentos a pagar', ruta: '/admin/finanzas/documentos' },
      { nombre: 'Pagos', ruta: '/admin/finanzas/pagos' },
      { nombre: 'Gastos fijos', ruta: '/admin/finanzas/gastos-fijos' },
      { nombre: 'Cheques', ruta: '/admin/finanzas/cheques' },
      { nombre: 'Impuestos', ruta: '/admin/finanzas/impuestos' },
      { nombre: 'Cuentas y movimientos', ruta: '/admin/finanzas/cuentas' },
      { nombre: 'Conciliación', ruta: '/admin/finanzas/conciliacion' },
      { nombre: 'Cash flow', ruta: '/admin/finanzas/cash-flow' },
      { nombre: 'Calendario de pagos', ruta: '/admin/finanzas/calendario' },
      { nombre: 'Aprobaciones', ruta: '/admin/aprobaciones' },
    ],
    badge: async (sb) => {
      // Documentos con vencimiento pasado (cuentas por pagar atrasadas).
      const n = await cuenta(sb.from('facturas_proveedor').select('id', { count: 'exact', head: true })
        .lt('fecha_vencimiento', hoyISO())
        .in('estado', ['pendiente_aprobacion', 'aprobada', 'programada_pago', 'pagada_parcial', 'vencida']))
      return n > 0 ? { count: n, severidad: 'danger' } : null
    },
    quickActions: [
      { id: 'pago', nombre: 'Registrar pago', icono: 'CreditCard', destino: '/admin/finanzas/pagos', modulo: 'finanzas', accion: 'aprobar', primary: true },
      { id: 'factura', nombre: 'Cargar factura', icono: 'FileText', destino: '/admin/finanzas/documentos', modulo: 'finanzas', accion: 'crear' },
      { id: 'arqueo', nombre: 'Cerrar caja', icono: 'Wallet', destino: '/admin/finanzas/caja', modulo: 'caja', accion: 'crear' },
    ],
  },
  {
    id: 'comunicacion',
    nombre: 'Comunicación',
    icono: 'MessageSquare',
    acento: '#3B82F6',
    descripcion: 'Chat interno, comunicados y tu bandeja',
    rutaHome: '/admin/comunicacion',
    navInterna: 'tabs',
    permisosRequeridos: ['comunicacion'],
    modulos: [
      { nombre: 'Inbox', ruta: '/admin/comunicacion' },
      { nombre: 'Comunicados', ruta: '/admin/comunicacion/comunicados' },
      { nombre: 'Mi bandeja', ruta: '/admin/comunicacion/mi-bandeja' },
    ],
    quickActions: [
      { id: 'mensaje', nombre: 'Mandar mensaje', icono: 'MessageSquare', destino: '/admin/comunicacion', modulo: 'comunicacion', accion: 'crear', primary: true },
    ],
  },
  {
    id: 'clientes',
    nombre: 'Clientes',
    icono: 'Users',
    acento: '#EC4899',
    descripcion: 'CRM, segmentos, puntos y campañas',
    rutaHome: '/admin/clientes',
    navInterna: 'tabs',
    permisosRequeridos: ['clientes'],
    modulos: [
      { nombre: 'Clientes', ruta: '/admin/clientes' },
      { nombre: 'Segmentos', ruta: '/admin/clientes/segmentos' },
      { nombre: 'B2B', ruta: '/admin/clientes/b2b' },
      { nombre: 'Puntos', ruta: '/admin/clientes/puntos' },
      { nombre: 'Automatizaciones', ruta: '/admin/clientes/automatizaciones' },
      { nombre: 'Comunicación a clientes', ruta: '/admin/clientes/comunicacion' },
      { nombre: 'Duplicados', ruta: '/admin/clientes/duplicados' },
    ],
    quickActions: [
      { id: 'cliente-nuevo', nombre: 'Nuevo cliente', icono: 'UserPlus', destino: '/admin/clientes/nuevo', modulo: 'clientes', accion: 'crear', primary: true },
    ],
  },
  {
    id: 'ofertas',
    nombre: 'Ofertas',
    icono: 'Tag',
    acento: '#F43F5E',
    descripcion: 'Promos, propuestas de NORA y rendimiento',
    rutaHome: '/admin/ofertas',
    navInterna: 'tabs',
    permisosRequeridos: ['ofertas'],
    modulos: [
      { nombre: 'Ofertas', ruta: '/admin/ofertas' },
      { nombre: 'Propuestas de NORA', ruta: '/admin/ofertas/propuestas' },
      { nombre: 'Calendario', ruta: '/admin/ofertas/calendario' },
      { nombre: 'Rendimiento', ruta: '/admin/ofertas/rendimiento' },
      { nombre: 'Para ofrecer', ruta: '/admin/ofertas/panel' },
      { nombre: 'Validación de tickets', ruta: '/admin/ia/tickets' },
    ],
    quickActions: [
      { id: 'oferta-nueva', nombre: 'Nueva oferta', icono: 'Tag', destino: '/admin/ofertas', modulo: 'ofertas', accion: 'crear', primary: true },
    ],
  },
  {
    id: 'personas',
    nombre: 'Personas',
    icono: 'UserCheck',
    acento: '#8B5CF6',
    descripcion: 'Equipo, ranking, objetivos y legajos',
    rutaHome: '/admin/rrhh',
    navInterna: 'tabs',
    permisosRequeridos: ['rrhh'],
    modulos: [
      { nombre: 'Resumen', ruta: '/admin/rrhh' },
      { nombre: 'Empleados', ruta: '/admin/rrhh/empleados' },
      { nombre: 'Mi equipo', ruta: '/admin/mi-equipo' },
      { nombre: 'Ranking', ruta: '/admin/ranking' },
      { nombre: 'Objetivos', ruta: '/admin/objetivos' },
    ],
    quickActions: [
      { id: 'empleado-nuevo', nombre: 'Nuevo empleado', icono: 'UserPlus', destino: '/admin/rrhh/empleados/nuevo', modulo: 'rrhh', accion: 'crear', primary: true },
    ],
  },
  {
    id: 'centro-datos',
    nombre: 'Centro de Datos',
    icono: 'Database',
    acento: '#0EA5E9',
    descripcion: 'Importar / exportar SIFACO y ventas diarias',
    rutaHome: '/admin/centro-datos',
    navInterna: 'sidebar',
    permisosRequeridos: ['centro_datos'],
    modulos: [
      { nombre: 'Centro de Datos', ruta: '/admin/centro-datos' },
      { nombre: 'Importar', ruta: '/admin/centro-datos/importar' },
      { nombre: 'Exportar', ruta: '/admin/centro-datos/exportar' },
      { nombre: 'Ventas diarias', ruta: '/admin/centro-datos/ventas-diarias' },
      { nombre: 'Perfiles', ruta: '/admin/centro-datos/perfiles' },
      { nombre: 'Historial', ruta: '/admin/centro-datos/historial' },
      { nombre: 'Sin matchear', ruta: '/admin/centro-datos/sin-matchear' },
    ],
    badge: async (sb, _u, rol) => {
      if (!['super_admin', 'gerente', 'auditor', 'administrativo'].includes(rol)) return null
      const n = await cuenta(sb.from('items_sin_match').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente'))
      return n > 0 ? { count: n, severidad: 'info' } : null
    },
    quickActions: [
      { id: 'importar', nombre: 'Importar archivo', icono: 'Upload', destino: '/admin/centro-datos/importar', modulo: 'centro_datos', accion: 'crear', primary: true },
    ],
  },
  {
    id: 'inteligencia',
    nombre: 'Inteligencia',
    icono: 'Sparkles',
    acento: '#A855F7',
    descripcion: 'NORA, BI y el resumen del día',
    rutaHome: '/admin/nora',
    navInterna: 'tabs',
    permisosRequeridos: ['ia', 'bi'],
    modulos: [
      { nombre: 'NORA', ruta: '/admin/nora' },
      { nombre: 'Feed de NORA', ruta: '/admin/nora/feed' },
      { nombre: 'BI / Reportes', ruta: '/admin/bi' },
      { nombre: 'Resumen IA del día', ruta: '/admin/ia/resumen' },
      { nombre: 'Panel IA', ruta: '/admin/ia' },
      { nombre: 'Performance de sucursales', ruta: '/admin/sucursales/performance' },
      { nombre: 'Listado de sucursales', ruta: '/admin/sucursales' },
    ],
    badge: async (sb) => {
      const n = await cuenta(sb.from('nora_avisos').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente'))
      return n > 0 ? { count: n, severidad: 'info' } : null
    },
    quickActions: [
      { id: 'nora-chat', nombre: 'Preguntarle a NORA', icono: 'Sparkles', destino: '/admin/nora', primary: true },
    ],
  },
  {
    id: 'configuracion',
    nombre: 'Configuración',
    icono: 'Settings',
    acento: '#64748B',
    descripcion: 'Usuarios, permisos, catálogo y sistema',
    rutaHome: '/admin/configuracion/usuarios',
    navInterna: 'sidebar',
    permisosRequeridos: ['configuracion'],
    rolesPermitidos: ['super_admin', 'gerente'],
    modulos: [
      { nombre: 'Usuarios y permisos', ruta: '/admin/configuracion/usuarios' },
      { nombre: 'Catálogo de productos', ruta: '/admin/configuracion/catalogo' },
      { nombre: 'Tipos de tareas', ruta: '/admin/configuracion/tipos-tareas' },
      { nombre: 'Recurrencias', ruta: '/admin/configuracion/recurrencias' },
      { nombre: 'Turnos', ruta: '/admin/configuracion/turnos' },
      { nombre: 'Supervisores', ruta: '/admin/configuracion/supervisores' },
      { nombre: 'General', ruta: '/admin/configuracion/general' },
    ],
    quickActions: [
      { id: 'usuario-nuevo', nombre: 'Nuevo usuario', icono: 'Shield', destino: '/admin/configuracion/usuarios', modulo: 'configuracion', accion: 'crear' },
    ],
  },

  // ── Registradas pero NO mostradas (proximamente / app aparte) ──
  {
    id: 'decisiones',
    nombre: 'Decisiones',
    icono: 'GitBranch',
    acento: '#6E3CDB',
    descripcion: 'Memoria de decisiones del negocio',
    rutaHome: '#',
    navInterna: 'tabs',
    permisosRequeridos: ['mission_control'],
    modulos: [],
    quickActions: [],
    proximamente: true,
  },
  {
    id: 'pedidos',
    nombre: 'Pedidos',
    icono: 'Package',
    acento: '#2EE1A8',
    descripcion: 'CRM de pedidos (app aparte)',
    rutaHome: '/dashboard',
    navInterna: 'tabs',
    permisosRequeridos: ['pedidos'],
    modulos: [],
    quickActions: [],
    proximamente: true,
    externo: true,
  },
]

// ───────────────────────── Acciones globales (siempre en "+" nivel 1) ─────────────────────────
export const ACCIONES_GLOBALES: QuickAction[] = [
  { id: 'g-tarea', nombre: 'Crear tarea', icono: 'ListPlus', destino: '/admin/tareas', modulo: 'tareas', accion: 'crear', primary: true },
  { id: 'g-mensaje', nombre: 'Mandar mensaje', icono: 'MessageSquare', destino: '/admin/comunicacion', modulo: 'comunicacion', accion: 'crear', primary: true },
  { id: 'g-demanda', nombre: 'Me pidieron y no había', icono: 'PackageX', destino: '#', primary: true, proximamente: true },
]

// ───────────────────────── Helpers de permisos / filtrado ─────────────────────────

/** ¿El usuario puede ver esta sub-app? (super_admin todo; respeta proximamente). */
export function puedeVerSubApp(rol: AdminRole, custom: PermisosCustom | null | undefined, app: SubAppManifest): boolean {
  if (app.proximamente) return false
  if (app.rolesPermitidos && !app.rolesPermitidos.includes(rol)) return false
  if (rol === 'super_admin') return true
  return app.permisosRequeridos.some((m) => puede(rol, custom ?? null, m, 'ver'))
}

/** Sub-apps visibles para el usuario, en orden del registry. */
export function subAppsVisibles(rol: AdminRole | null, custom?: PermisosCustom | null): SubAppManifest[] {
  if (!rol) return []
  return SUBAPPS.filter((a) => puedeVerSubApp(rol, custom, a))
}

/** La sub-app que contiene una ruta (para estado activo del dock + nav interna). */
export function subAppDeRuta(pathname: string): SubAppManifest | null {
  let mejor: SubAppManifest | null = null
  let mejorLen = -1
  for (const app of SUBAPPS) {
    if (app.proximamente) continue
    const rutas = [app.rutaHome, ...app.modulos.map((m) => m.ruta)]
    for (const r of rutas) {
      if (r === '#' || r === '/dashboard') continue
      if ((pathname === r || pathname.startsWith(r + '/')) && r.length > mejorLen) {
        mejor = app
        mejorLen = r.length
      }
    }
  }
  return mejor
}

/** ¿El usuario puede ejecutar esta quick action? */
export function puedeAccion(rol: AdminRole, custom: PermisosCustom | null | undefined, a: QuickAction): boolean {
  if (a.roles && !a.roles.includes(rol)) return false
  if (!a.modulo) return true
  if (rol === 'super_admin') return true
  return puede(rol, custom ?? null, a.modulo, a.accion ?? 'ver')
}

/** Todas las quick actions permitidas (globales + de cada sub-app visible), aplanadas para ⌘K. */
export function quickActionsVisibles(rol: AdminRole | null, custom?: PermisosCustom | null): { app: SubAppManifest | null; action: QuickAction }[] {
  if (!rol) return []
  const out: { app: SubAppManifest | null; action: QuickAction }[] = []
  for (const a of ACCIONES_GLOBALES) if (puedeAccion(rol, custom, a)) out.push({ app: null, action: a })
  for (const app of subAppsVisibles(rol, custom)) {
    for (const a of app.quickActions) if (puedeAccion(rol, custom, a)) out.push({ app, action: a })
  }
  return out
}
