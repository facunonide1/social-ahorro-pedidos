/**
 * Permisos finos por sector de NORA HQ (v2 · v0.26).
 *
 * Modelo: **18 módulos × 5 acciones**. El permiso efectivo de un usuario es:
 *
 *     preset del rol  ⊕  overrides de `users_admin.permisos_custom`
 *
 * Cada celda (módulo, acción) → boolean. La UI usa `puede()` para ocultar/
 * deshabilitar; las APIs usan el mismo `puede()` para gatear de verdad (403).
 *
 * Sub-permisos sensibles (ver saldo de caja general, aprobar retiros, editar
 * precios) se derivan al final del archivo.
 */

import type { AdminRole } from '@/lib/types/admin'

// ───────────────────────── Módulos (18) ─────────────────────────
export const PERMISO_MODULOS = [
  'mission_control',
  'comunicacion',
  'tareas',
  'operaciones',
  'compras',
  'finanzas',
  'caja',
  'centro_datos',
  'ofertas',
  'clientes',
  'pedidos',
  'sucursales',
  'rrhh',
  'aprobaciones',
  'bi',
  'ia',
  'auditoria',
  'configuracion',
] as const
export type PermisoModulo = (typeof PERMISO_MODULOS)[number]

export const PERMISO_ACCIONES = ['ver', 'crear', 'editar', 'aprobar', 'eliminar'] as const
export type PermisoAccion = (typeof PERMISO_ACCIONES)[number]

export const PERMISO_MODULO_LABELS: Record<PermisoModulo, string> = {
  mission_control: 'Mission Control',
  comunicacion:    'Comunicación',
  tareas:          'Tareas y equipo',
  operaciones:     'Operaciones / Stock',
  compras:         'Compras',
  finanzas:        'Finanzas',
  caja:            'Caja',
  centro_datos:    'Centro de Datos',
  ofertas:         'Ofertas / Comercial',
  clientes:        'Clientes / CRM',
  pedidos:         'Pedidos',
  sucursales:      'Sucursales',
  rrhh:            'RRHH / Legajos',
  aprobaciones:    'Aprobaciones',
  bi:              'BI / Reportes',
  ia:              'Inteligencia / NORA',
  auditoria:       'Auditoría',
  configuracion:   'Configuración',
}

/** Agrupación de módulos para la matriz de la UI. */
export const PERMISO_MODULO_GRUPOS: { grupo: string; modulos: PermisoModulo[] }[] = [
  { grupo: 'General', modulos: ['mission_control', 'comunicacion', 'tareas'] },
  { grupo: 'Operación', modulos: ['operaciones', 'compras', 'centro_datos'] },
  { grupo: 'Dinero', modulos: ['finanzas', 'caja', 'aprobaciones'] },
  { grupo: 'Comercial', modulos: ['ofertas', 'clientes', 'pedidos'] },
  { grupo: 'Organización', modulos: ['sucursales', 'rrhh'] },
  { grupo: 'Inteligencia', modulos: ['bi', 'ia'] },
  { grupo: 'Sistema', modulos: ['auditoria', 'configuracion'] },
]

export const PERMISO_ACCION_LABELS: Record<PermisoAccion, string> = {
  ver: 'Ver', crear: 'Crear', editar: 'Editar', aprobar: 'Aprobar', eliminar: 'Eliminar',
}

/** Matriz completa módulo → acción → boolean. */
export type MatrizPermisos = Record<PermisoModulo, Record<PermisoAccion, boolean>>
/** Overrides parciales (lo que se guarda en `permisos_custom`). */
export type PermisosCustom = Partial<
  Record<PermisoModulo, Partial<Record<PermisoAccion, boolean>>>
>

// ───────────────────────── Builders ─────────────────────────
function fila(ver: boolean, crear: boolean, editar: boolean, aprobar: boolean, eliminar: boolean): Record<PermisoAccion, boolean> {
  return { ver, crear, editar, aprobar, eliminar }
}
const TODO = fila(true, true, true, true, true)
const VCEA = fila(true, true, true, true, false)   // ver/crear/editar/aprobar
const VCE  = fila(true, true, true, false, false)   // ver/crear/editar
const VC   = fila(true, true, false, false, false)  // ver/crear
const VER  = fila(true, false, false, false, false)
const NADA = fila(false, false, false, false, false)

function matriz(por: Partial<Record<PermisoModulo, Record<PermisoAccion, boolean>>>, base: Record<PermisoAccion, boolean> = NADA): MatrizPermisos {
  return PERMISO_MODULOS.reduce((acc, m) => { acc[m] = por[m] ?? base; return acc }, {} as MatrizPermisos)
}

// ───────────────────────── Presets por rol ─────────────────────────
export const PRESET_POR_ROL: Record<AdminRole, MatrizPermisos> = {
  super_admin: matriz({}, TODO),

  gerente: matriz({ configuracion: VER, auditoria: VER }, TODO),

  encargado_sucursal: matriz({
    mission_control: VER, comunicacion: VCE, tareas: VCEA,
    operaciones: VCE, compras: VC, finanzas: VER, caja: VCEA,
    ofertas: VER, clientes: VCE, pedidos: VCE, sucursales: VER,
    rrhh: VER, aprobaciones: VER, bi: VER, ia: VER, centro_datos: VER,
  }, NADA),

  comprador: matriz({
    mission_control: VER, comunicacion: VCE, tareas: VC,
    operaciones: VCE, compras: TODO, centro_datos: VCE,
    finanzas: VER, ofertas: VER, bi: VER,
  }, NADA),

  tesoreria: matriz({
    mission_control: VER, comunicacion: VCE, tareas: VC,
    finanzas: TODO, caja: VCEA, aprobaciones: VCEA, compras: VER,
    centro_datos: VER, bi: VER,
  }, NADA),

  cajero: matriz({
    mission_control: VER, comunicacion: VCE, tareas: VCE,
    caja: VCE, pedidos: VCE, clientes: VC, operaciones: VER,
  }, NADA),

  repartidor: matriz({
    mission_control: VER, comunicacion: VCE, tareas: VCE,
    pedidos: VCE, clientes: VER,
  }, NADA),

  rrhh: matriz({
    mission_control: VER, comunicacion: VCE, tareas: VCEA,
    rrhh: TODO, sucursales: VER, bi: VER, aprobaciones: VER,
  }, NADA),

  marketing: matriz({
    mission_control: VER, comunicacion: VCE, tareas: VC,
    ofertas: TODO, clientes: VCE, pedidos: VER, centro_datos: VER, bi: VER, ia: VER,
  }, NADA),

  empleado_general: matriz({
    mission_control: VER, comunicacion: VCE, tareas: VCE,
    operaciones: VER, clientes: VER,
  }, NADA),

  // ── legacy mapeados ──
  administrativo: matriz({
    mission_control: VER, comunicacion: VCE, tareas: VC,
    finanzas: VCE, clientes: VCE, rrhh: VCE, operaciones: VER, compras: VER, bi: VER,
  }, NADA),

  auditor: matriz({}, VER),

  sucursal: matriz({   // = encargado_sucursal
    mission_control: VER, comunicacion: VCE, tareas: VCEA,
    operaciones: VCE, compras: VC, finanzas: VER, caja: VCEA,
    ofertas: VER, clientes: VCE, pedidos: VCE, sucursales: VER,
    rrhh: VER, aprobaciones: VER, bi: VER, ia: VER, centro_datos: VER,
  }, NADA),
}

// ───────────────────────── Efectivos + checks ─────────────────────────
/** Permiso efectivo = preset del rol con los overrides aplicados encima. */
export function permisosEfectivos(rol: AdminRole, custom?: PermisosCustom | null): MatrizPermisos {
  const base = PRESET_POR_ROL[rol] ?? matriz({}, NADA)
  if (!custom || Object.keys(custom).length === 0) return base
  return PERMISO_MODULOS.reduce((acc, m) => {
    acc[m] = PERMISO_ACCIONES.reduce((row, a) => {
      const ov = custom[m]?.[a]
      row[a] = typeof ov === 'boolean' ? ov : base[m][a]
      return row
    }, {} as Record<PermisoAccion, boolean>)
    return acc
  }, {} as MatrizPermisos)
}

/** True si el usuario tiene la acción habilitada en el módulo. */
export function puede(rol: AdminRole, custom: PermisosCustom | null | undefined, modulo: PermisoModulo, accion: PermisoAccion): boolean {
  return permisosEfectivos(rol, custom)[modulo]?.[accion] ?? false
}

/** Diff de una matriz contra el preset del rol → solo los cambios (para guardar). */
export function diffContraPreset(rol: AdminRole, matriz: MatrizPermisos): PermisosCustom {
  const base = PRESET_POR_ROL[rol] ?? {}
  const out: PermisosCustom = {}
  for (const m of PERMISO_MODULOS) {
    for (const a of PERMISO_ACCIONES) {
      const val = matriz[m][a]
      if (val !== (base as MatrizPermisos)[m][a]) {
        out[m] = out[m] ?? {}
        out[m]![a] = val
      }
    }
  }
  return out
}

/** ¿La celda viene overrideada respecto del preset del rol? (para resaltar en UI) */
export function esOverride(rol: AdminRole, custom: PermisosCustom | null | undefined, m: PermisoModulo, a: PermisoAccion): boolean {
  if (!custom?.[m]) return false
  const ov = custom[m]![a]
  if (typeof ov !== 'boolean') return false
  return ov !== PRESET_POR_ROL[rol][m][a]
}

// ───────────────────────── Sub-permisos sensibles ─────────────────────────
/** Ver el saldo de la caja general (no solo operar un turno). */
export function puedeVerSaldoCajaGeneral(rol: AdminRole, custom?: PermisosCustom | null): boolean {
  if (rol === 'super_admin' || rol === 'gerente' || rol === 'tesoreria') return true
  // un encargado con aprobar en caja también ve el saldo general de su sucursal
  return puede(rol, custom, 'caja', 'aprobar')
}
/** Aprobar retiros de caja / pagos. */
export function puedeAprobarRetiros(rol: AdminRole, custom?: PermisosCustom | null): boolean {
  return puede(rol, custom, 'aprobaciones', 'aprobar') || puede(rol, custom, 'caja', 'aprobar')
}
/** Editar precios (catálogo / ofertas). */
export function puedeEditarPrecios(rol: AdminRole, custom?: PermisosCustom | null): boolean {
  return puede(rol, custom, 'ofertas', 'editar') || puede(rol, custom, 'operaciones', 'editar')
}
