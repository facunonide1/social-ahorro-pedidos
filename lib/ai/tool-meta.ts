/**
 * Metadata de las tools de NORA (núcleo unificado · v0.30). Clasifica cada tool
 * por CAPA (lectura = explica/sugiere, sin riesgo · accion = "hace") y por MÓDULO
 * (para gatear por permiso: NORA no hace lo que el usuario no puede). No toca las
 * definiciones de las tools — es un mapa paralelo keyed por nombre.
 */
import type { PermisoModulo, PermisoAccion } from '@/lib/types/permisos'

export type ToolCapa = 'lectura' | 'accion'

export type ToolMeta = {
  capa: ToolCapa
  modulo: PermisoModulo
  /** acción de permiso requerida (default: ver para lectura, crear para accion) */
  accion?: PermisoAccion
  /** las de capa 'accion' reversibles pueden deshacerse */
  reversible?: boolean
  /** nombre legible para el registro/auditoría */
  label?: string
}

/** Clasificación de las tools existentes + las nuevas de acción. */
export const TOOL_META: Record<string, ToolMeta> = {
  // ── Clientes / CRM ──
  buscar_cliente:        { capa: 'lectura', modulo: 'clientes' },
  perfil_cliente:        { capa: 'lectura', modulo: 'clientes' },
  clientes_en_riesgo:    { capa: 'lectura', modulo: 'clientes' },
  // ── Centro de Datos ──
  centro_datos_estado:   { capa: 'lectura', modulo: 'centro_datos' },
  ventas_dia:            { capa: 'lectura', modulo: 'centro_datos' },
  items_sin_match:       { capa: 'lectura', modulo: 'centro_datos' },
  // ── Ofertas ──
  ofertas_activas:       { capa: 'lectura', modulo: 'ofertas' },
  oferta_para_cliente:   { capa: 'lectura', modulo: 'ofertas' },
  estado_lectura_oferta: { capa: 'lectura', modulo: 'ofertas' },
  // ── Compras ──
  get_faltantes:         { capa: 'lectura', modulo: 'compras' },
  score_proveedor:       { capa: 'lectura', modulo: 'compras' },
  get_proveedor_resumen: { capa: 'lectura', modulo: 'compras' },
  // ── Pedidos ──
  get_pedidos:           { capa: 'lectura', modulo: 'pedidos' },
  // ── Operaciones / Stock ──
  get_resumen_ventas:    { capa: 'lectura', modulo: 'operaciones' },
  get_stock_critico:     { capa: 'lectura', modulo: 'operaciones' },
  get_vencimientos_proximos: { capa: 'lectura', modulo: 'operaciones' },
  get_anomalias:         { capa: 'lectura', modulo: 'operaciones' },
  // ── Finanzas ──
  get_facturas_vencer:   { capa: 'lectura', modulo: 'finanzas' },
  get_cash_flow_resumen: { capa: 'lectura', modulo: 'finanzas' },
  // ── Tareas / Equipo ──
  listar_tareas:         { capa: 'lectura', modulo: 'tareas' },
  priorizar_mis_tareas:  { capa: 'lectura', modulo: 'tareas' },
  get_performance_empleado: { capa: 'lectura', modulo: 'rrhh' },
  get_ranking_sucursal:  { capa: 'lectura', modulo: 'tareas' },
  get_objetivos_empleado:{ capa: 'lectura', modulo: 'rrhh' },
  // ── Acciones ("hace") — reversibles, registradas ──
  crear_tarea:           { capa: 'accion', modulo: 'tareas', accion: 'crear', reversible: true, label: 'Crear tarea' },
  actualizar_estado_tarea: { capa: 'accion', modulo: 'tareas', accion: 'editar', reversible: false, label: 'Cambiar estado de tarea' },
  asignar_tarea:         { capa: 'accion', modulo: 'tareas', accion: 'editar', reversible: true, label: 'Asignar tarea' },
}

export function metaDe(tool: string): ToolMeta {
  return TOOL_META[tool] ?? { capa: 'lectura', modulo: 'mission_control' }
}

export function esAccion(tool: string): boolean {
  return metaDe(tool).capa === 'accion'
}
