import { puede, type PermisosCustom } from '@/lib/types/permisos'
import type { AdminRole } from '@/lib/types/admin'
import type { PermisoModulo, PermisoAccion } from '@/lib/types/permisos'

/**
 * QUÉ PUEDE VER NORA, SEGÚN QUIÉN LE HABLA.
 *
 * ── POR QUÉ ESTO NO PUEDE VIVIR EN EL PROMPT ────────────────────────────────
 *
 * Hasta v0.86 el chat le pasaba a Claude las TREINTA herramientas, para todos
 * los roles, y el permiso se resolvía —cuando se resolvía— adentro de cada
 * función. Alguien de mostrador preguntando por la caja recibía en el catálogo
 * `get_cash_flow_resumen`, `get_facturas_vencer` y `get_resumen_ventas`.
 *
 * Que el modelo «sepa» que no debe usarlas no alcanza. Un modelo al que se le
 * pide que no use algo, algún día lo usa: basta una pregunta ambigua, un
 * historial largo, o una versión nueva del modelo. **La herramienta no tiene
 * que estar en su catálogo.**
 *
 * Es la regla de oro 10 —permisos por rol × sucursal × sub-app— aplicada donde
 * se puede verificar: en la lista que sale por la red hacia el modelo.
 *
 * ── CÓMO SE VERIFICA ────────────────────────────────────────────────────────
 *
 * `scripts/probar-permisos-nora.ts` arma el catálogo para tres roles y
 * comprueba que las de plata NO están en el del mostrador. No comprueba que el
 * modelo se negó: comprueba que no las recibió, que es otra cosa.
 */

export type PermisoTool = {
  /** Módulo y acción del sistema de permisos. */
  permiso?: { modulo: PermisoModulo; accion: PermisoAccion }
  /** Roles que la pueden usar, cuando el permiso solo no alcanza. */
  roles?: AdminRole[]
  /** Escribe algo. Las de lectura son más laxas; éstas nunca. */
  escribe?: boolean
  /** Por qué existe la restricción, para poder explicarla en castellano. */
  motivo?: string
}

/**
 * El permiso de cada herramienta, declarado en UN solo lugar.
 *
 * Lo que no está acá NO se ofrece: el default es negar. Si mañana alguien
 * agrega una herramienta y se olvida de declararla, no llega al modelo — que es
 * el modo correcto de fallar.
 */
export const PERMISOS_TOOLS: Record<string, PermisoTool> = {
  // ── Lo que puede ver cualquiera que trabaje acá ──────────────────────────
  ir_a_pantalla: {},
  listar_tareas: { permiso: { modulo: 'tareas', accion: 'ver' } },
  priorizar_mis_tareas: { permiso: { modulo: 'tareas', accion: 'ver' } },
  crear_tarea: { permiso: { modulo: 'tareas', accion: 'crear' }, escribe: true },
  actualizar_estado_tarea: { permiso: { modulo: 'tareas', accion: 'editar' }, escribe: true },
  asignar_tarea: { permiso: { modulo: 'tareas', accion: 'editar' }, escribe: true },
  get_objetivos_empleado: { permiso: { modulo: 'rrhh', accion: 'ver' } },

  // ── Operación ────────────────────────────────────────────────────────────
  get_stock_critico: { permiso: { modulo: 'operaciones', accion: 'ver' } },
  get_vencimientos_proximos: { permiso: { modulo: 'operaciones', accion: 'ver' } },
  get_anomalias: { permiso: { modulo: 'operaciones', accion: 'ver' } },
  get_faltantes: { permiso: { modulo: 'compras', accion: 'ver' } },

  // ── Clientes y ofertas ───────────────────────────────────────────────────
  buscar_cliente: { permiso: { modulo: 'clientes', accion: 'ver' } },
  perfil_cliente: { permiso: { modulo: 'clientes', accion: 'ver' } },
  clientes_en_riesgo: { permiso: { modulo: 'clientes', accion: 'ver' } },
  ofertas_activas: { permiso: { modulo: 'ofertas', accion: 'ver' } },
  oferta_para_cliente: { permiso: { modulo: 'ofertas', accion: 'ver' } },
  estado_lectura_oferta: { permiso: { modulo: 'ofertas', accion: 'ver' } },
  get_pedidos: { permiso: { modulo: 'clientes', accion: 'ver' } },

  // ── PLATA. Esto no lo ve el mostrador ────────────────────────────────────
  get_cash_flow_resumen: {
    permiso: { modulo: 'finanzas', accion: 'ver' },
    motivo: 'el flujo de caja es información de gerencia',
  },
  get_facturas_vencer: {
    permiso: { modulo: 'finanzas', accion: 'ver' },
    motivo: 'las facturas a pagar son información de gerencia',
  },
  get_resumen_ventas: {
    permiso: { modulo: 'finanzas', accion: 'ver' },
    motivo: 'los montos de venta son información de gerencia',
  },
  ventas_dia: {
    permiso: { modulo: 'finanzas', accion: 'ver' },
    motivo: 'los montos de venta son información de gerencia',
  },
  score_proveedor: { permiso: { modulo: 'compras', accion: 'ver' } },
  get_proveedor_resumen: { permiso: { modulo: 'compras', accion: 'ver' } },

  // ── Datos y desempeño de personas ────────────────────────────────────────
  centro_datos_estado: { roles: ['super_admin', 'gerente', 'administrativo'] },
  items_sin_match: { roles: ['super_admin', 'gerente', 'administrativo', 'comprador'] },
  get_performance_empleado: {
    permiso: { modulo: 'rrhh', accion: 'ver' },
    motivo: 'el desempeño de una persona lo ve quien la conduce',
  },
  get_ranking_sucursal: {
    permiso: { modulo: 'rrhh', accion: 'ver' },
    motivo: 'el ranking del equipo lo ve quien lo conduce',
  },
}

export interface QuienHabla {
  rol: AdminRole
  permisosCustom: PermisosCustom | null
}

/** ¿Este usuario puede usar esta herramienta? */
export function puedeUsar(id: string, quien: QuienHabla): boolean {
  const p = PERMISOS_TOOLS[id]
  // El default es NEGAR: una herramienta sin declarar no llega al modelo.
  if (!p) return false
  if (quien.rol === 'super_admin') return true
  if (p.roles && !p.roles.includes(quien.rol)) return false
  if (p.permiso && !puede(quien.rol, quien.permisosCustom, p.permiso.modulo, p.permiso.accion)) return false
  return true
}

/** Los ids que este usuario SÍ puede usar. Es lo único que sale hacia el modelo. */
export function idsPermitidos(todos: string[], quien: QuienHabla): string[] {
  return todos.filter((id) => puedeUsar(id, quien))
}

/**
 * Por qué NO puede, en castellano y sin códigos técnicos.
 *
 * Los cuatro motivos de negativa (v0.86):
 *   1 · no lo puede hacer nadie desde acá  → 'constitucion'
 *   2 · esa capacidad no existe todavía    → 'no_existe'
 *   3 · este usuario no tiene permiso      → 'sin_permiso'
 *   4 · faltan datos para contestar        → 'sin_datos'
 */
export function porQueNo(id: string, quien: QuienHabla): string | null {
  if (puedeUsar(id, quien)) return null
  const p = PERMISOS_TOOLS[id]
  if (!p) return `Eso no lo sé hacer todavía. No es que no quiera: no existe esa capacidad en NORA.`
  const extra = p.motivo ? ` — ${p.motivo}` : ''
  return `Eso no te lo puedo mostrar con tu rol${extra}. Si lo necesitás, pedíselo a gerencia.`
}
