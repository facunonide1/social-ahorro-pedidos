/**
 * Modelo de permisos granulares de NORA HQ (F6.5.T5).
 *
 * Permiso efectivo = preset del rol  ⊕  overrides de `users_admin.permisos_custom`.
 * Cada celda es módulo × acción → boolean.
 */

import type { AdminRole } from '@/lib/types/admin'

export const PERMISO_MODULOS = [
  'operacion',
  'finanzas',
  'compras',
  'equipo',
  'clientes',
  'inteligencia',
  'configuracion',
] as const
export type PermisoModulo = (typeof PERMISO_MODULOS)[number]

export const PERMISO_ACCIONES = ['ver', 'crear', 'editar', 'eliminar', 'aprobar'] as const
export type PermisoAccion = (typeof PERMISO_ACCIONES)[number]

export const PERMISO_MODULO_LABELS: Record<PermisoModulo, string> = {
  operacion: 'Operación',
  finanzas: 'Finanzas',
  compras: 'Compras',
  equipo: 'Equipo',
  clientes: 'Clientes',
  inteligencia: 'Inteligencia',
  configuracion: 'Configuración',
}

export const PERMISO_ACCION_LABELS: Record<PermisoAccion, string> = {
  ver: 'Ver',
  crear: 'Crear',
  editar: 'Editar',
  eliminar: 'Eliminar',
  aprobar: 'Aprobar',
}

/** Matriz completa módulo → acción → boolean. */
export type MatrizPermisos = Record<PermisoModulo, Record<PermisoAccion, boolean>>
/** Overrides parciales (lo que se guarda en permisos_custom). */
export type PermisosCustom = Partial<
  Record<PermisoModulo, Partial<Record<PermisoAccion, boolean>>>
>

function fila(
  ver: boolean,
  crear: boolean,
  editar: boolean,
  eliminar: boolean,
  aprobar: boolean,
): Record<PermisoAccion, boolean> {
  return { ver, crear, editar, eliminar, aprobar }
}

const TODO = fila(true, true, true, true, true)
const SOLO_VER = fila(true, false, false, false, false)
const CRUD = fila(true, true, true, false, false)
const NADA = fila(false, false, false, false, false)

function matriz(
  por: Partial<Record<PermisoModulo, Record<PermisoAccion, boolean>>>,
  base: Record<PermisoAccion, boolean> = NADA,
): MatrizPermisos {
  return PERMISO_MODULOS.reduce((acc, m) => {
    acc[m] = por[m] ?? base
    return acc
  }, {} as MatrizPermisos)
}

/**
 * Preset de permisos por rol legacy v1. Es el punto de partida que luego
 * overridea `permisos_custom`.
 */
export const PRESET_POR_ROL: Record<AdminRole, MatrizPermisos> = {
  super_admin: matriz({}, TODO),
  gerente: matriz({}, TODO),
  auditor: matriz({}, SOLO_VER),
  comprador: matriz(
    { compras: TODO, operacion: CRUD, inteligencia: SOLO_VER },
    SOLO_VER,
  ),
  administrativo: matriz(
    { finanzas: CRUD, equipo: CRUD, clientes: CRUD, operacion: SOLO_VER },
    SOLO_VER,
  ),
  tesoreria: matriz(
    { finanzas: fila(true, true, true, false, true) },
    SOLO_VER,
  ),
  sucursal: matriz(
    { operacion: CRUD, clientes: SOLO_VER, equipo: SOLO_VER },
    NADA,
  ),
}

/** Permiso efectivo = preset del rol con los overrides aplicados encima. */
export function permisosEfectivos(
  rol: AdminRole,
  custom?: PermisosCustom | null,
): MatrizPermisos {
  const base = PRESET_POR_ROL[rol] ?? matriz({}, NADA)
  if (!custom) return base
  return PERMISO_MODULOS.reduce((acc, m) => {
    acc[m] = PERMISO_ACCIONES.reduce(
      (row, a) => {
        const ov = custom[m]?.[a]
        row[a] = typeof ov === 'boolean' ? ov : base[m][a]
        return row
      },
      {} as Record<PermisoAccion, boolean>,
    )
    return acc
  }, {} as MatrizPermisos)
}

/** True si el usuario tiene la acción habilitada en el módulo. */
export function puede(
  rol: AdminRole,
  custom: PermisosCustom | null,
  modulo: PermisoModulo,
  accion: PermisoAccion,
): boolean {
  return permisosEfectivos(rol, custom)[modulo][accion]
}
