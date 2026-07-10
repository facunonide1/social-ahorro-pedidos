/**
 * Vista por rol — modo simple vs modo completo (v0.35-login-vista-rol).
 *
 * Idea: la misma app muestra MENOS según el rol. Los roles operativos (cajero,
 * repartidor, empleado general) no necesitan el árbol de 9 sectores: ven un HOME
 * reducido con pocos botones GRANDES — SOLO lo que su rol puede hacer. Los roles
 * de gestión (encargado) y el dueño/gerente ven el panel completo de siempre.
 *
 * No es un sistema paralelo: los botones se filtran con los MISMOS permisos finos
 * (`puede(modulo, accion)`) que ya gobiernan la navegación.
 */

import type { AdminRole } from '@/lib/types/admin'
import { puede, type PermisoModulo, type PermisoAccion, type PermisosCustom } from '@/lib/types/permisos'

/** Roles operativos que reciben la vista simple (home de botones grandes). */
export const ROLES_VISTA_SIMPLE: AdminRole[] = ['cajero', 'repartidor', 'empleado_general']

/** ¿Este rol usa la vista simple? (super_admin/gerente/encargado/etc. → completa) */
export function esVistaSimple(rol: AdminRole | null | undefined): boolean {
  if (!rol) return false
  return ROLES_VISTA_SIMPLE.includes(rol)
}

export type AccesoSimple = {
  key: string
  /** Texto grande del botón. */
  label: string
  /** Bajada corta (qué hace). */
  descripcion: string
  href: string
  /** Nombre de ícono lucide (usado por `<Icon name>`). */
  icon: string
  /** Permiso requerido; si es null el acceso es para todos los que tienen panel. */
  modulo: PermisoModulo | null
  accion: PermisoAccion
}

/**
 * Catálogo de accesos grandes candidatos, ordenado por relevancia operativa.
 * Cada uno se muestra solo si el usuario `puede(modulo, accion)`. El acceso a
 * NORA (`modulo: null`) se muestra siempre: es el ayudante transversal.
 */
export const ACCESOS_SIMPLES: AccesoSimple[] = [
  { key: 'mis_tareas',   label: 'Mis tareas',          descripcion: 'Lo que tenés que hacer hoy',   href: '/admin/mi-panel',                  icon: 'ListChecks',     modulo: 'tareas',      accion: 'ver' },
  { key: 'mi_caja',      label: 'Mi caja',             descripcion: 'Abrí el turno y cerrá el arqueo', href: '/admin/finanzas/caja',           icon: 'Wallet',         modulo: 'caja',        accion: 'crear' },
  { key: 'faltante',     label: 'Cargar un faltante',  descripcion: 'Avisá que falta un producto',  href: '/admin/compras/faltantes',         icon: 'AlertTriangle',  modulo: 'compras',     accion: 'crear' },
  { key: 'stock',        label: 'Stock',               descripcion: 'Consultar y reponer góndola',  href: '/admin/operaciones/stock',         icon: 'Boxes',          modulo: 'operaciones', accion: 'ver' },
  { key: 'vencimientos', label: 'Vencimientos',        descripcion: 'Productos por vencer',          href: '/admin/operaciones/vencimientos',  icon: 'CalendarClock',  modulo: 'operaciones', accion: 'ver' },
  { key: 'inventario',   label: 'Inventarios',         descripcion: 'Conteo de stock',              href: '/admin/operaciones/inventarios',   icon: 'ClipboardCheck', modulo: 'operaciones', accion: 'crear' },
  { key: 'control_zonas',label: 'Control por zonas',   descripcion: 'Tu control asignado',          href: '/admin/operaciones/control-zonas', icon: 'MapPin',         modulo: 'operaciones', accion: 'ver' },
  { key: 'ofrecer',      label: 'Ofertas para ofrecer',descripcion: 'Qué ofrecerle al cliente',     href: '/admin/ofertas/panel',             icon: 'Megaphone',      modulo: 'ofertas',     accion: 'ver' },
  { key: 'clientes',     label: 'Clientes',            descripcion: 'Buscar y cargar clientes',     href: '/admin/clientes',                  icon: 'Users',          modulo: 'clientes',    accion: 'ver' },
  { key: 'mensajes',     label: 'Mensajes del equipo', descripcion: 'Chat interno de la sucursal',  href: '/admin/comunicacion',              icon: 'MessageSquare',  modulo: 'comunicacion',accion: 'ver' },
  { key: 'nora',         label: 'Preguntarle a NORA',  descripcion: 'Tu asistente para lo que sea',  href: '/admin/nora',                      icon: 'Sparkles',       modulo: null,          accion: 'ver' },
]

/**
 * Accesos grandes que corresponden a un usuario, filtrados por sus permisos.
 * Siempre incluye NORA. Devuelve al menos "Mis tareas" + NORA como piso.
 */
export function accesosSimplesPara(rol: AdminRole, custom?: PermisosCustom | null): AccesoSimple[] {
  return ACCESOS_SIMPLES.filter((a) => a.modulo === null || puede(rol, custom ?? null, a.modulo, a.accion))
}
