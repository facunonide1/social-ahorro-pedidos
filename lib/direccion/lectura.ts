/**
 * LA DIRECCIÓN.
 *
 * ── QUÉ ES ESTA CAPA ────────────────────────────────────────────────────────
 *
 * El tablero del dueño, la comparación entre sucursales y la bandeja de lo que
 * espera. Ninguna de las tres calcula: leen lo que ya estaba calculado en seis
 * sectores distintos y lo ponen en una pantalla.
 *
 * ── LA REGLA QUE ORGANIZA TODO ──────────────────────────────────────────────
 *
 * Ningún número grande sin un botón al lado. Por eso las funciones devuelven
 * `href` y `accion` junto al número: con la ruta escrita en la pantalla, el
 * día que una cambia quedan dos lugares apuntando a una página que no existe.
 *
 * ── Y LA DE SIEMPRE ────────────────────────────────────────────────────────
 *
 * Si la consulta falla devuelve null y la pantalla dice que no pudo mirar. Un
 * `?? []` sobre un error deja todo en cero y la pantalla afirma que no hay
 * nada — el error de la v0.99, que en un tablero de dirección sería peor.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

type Adm = Pick<SupabaseClient, 'rpc' | 'from'>

async function rpc<T>(adm: Adm, fn: string, args?: Record<string, unknown>): Promise<T[] | null> {
  const { data, error } = await adm.rpc(fn, args ?? {})
  if (error) { console.error(`[direccion] ${fn}: ${error.message}`); return null }
  return (data ?? []) as T[]
}

async function rpcUno<T>(adm: Adm, fn: string, args?: Record<string, unknown>): Promise<T | null> {
  const { data, error } = await adm.rpc(fn, args ?? {})
  if (error) { console.error(`[direccion] ${fn}: ${error.message}`); return null }
  return (data ?? null) as T | null
}

/* ── C.3 · LO QUE ESTÁ EN JUEGO ─────────────────────────────────────────── */

export type EnJuego = {
  clave: string; titulo: string
  cuantos: number | null; plata: number | null
  /** `medido` se puede defender renglón por renglón; `estimado` tiene supuesto. */
  procedencia: 'medido' | 'estimado'
  de_donde: string
  /** La regla de la sesión: el botón viene con el número. */
  accion: string; href: string
  riesgo: boolean
}

export const enJuego = (adm: Adm) => rpc<EnJuego>(adm, 'direccion_en_juego')

/* ── C.2 · LOS NÚMEROS DEL NEGOCIO ─────────────────────────────────────── */

export type Indicador = {
  valor: number | null
  /** null = no hay serie histórica con qué comparar. No es «no cambió». */
  anterior: number | null
  variacion_pct?: number | null
  procedencia: 'medido' | 'estimado'
  de_donde: string
}

export type Negocio = {
  periodo: string | null
  periodo_anterior: string | null
  meses_completos: number
  /** Los meses a medio cargar no entran: compararlos contra uno entero miente. */
  meses_parciales_excluidos: number
  venta: Indicador
  margen: Indicador
  caja: Indicador
  deuda: Indicador
  stock: Indicador
  rotacion: Indicador
  que_no_dice: string
}

export const negocio = (adm: Adm) => rpcUno<Negocio>(adm, 'direccion_negocio')

/* ── C.4 · CUÁNTO DEJA CADA SUCURSAL ───────────────────────────────────── */

export type SucursalQueDeja = {
  sucursal_id: string; codigo: string; sucursal: string
  periodos_mirados: number; periodo_desde: string | null; periodo_hasta: string | null
  unidades: number
  venta_estimada: number; costo_estimado: number
  deja_estimado: number; margen_pct: number | null
  stock_al_costo: number | null; cobertura_meses: number | null
  empleados: number | null
  /** null = no hay empleados con sucursal asignada. No es cero. */
  venta_por_persona: number | null
  gastos_fijos: number | null
  /** **null es lo normal hoy**: sin gastos fijos no se puede decir si gana. */
  gana_plata: boolean | null
  por_que_no_se_puede_decir: string | null
}

export const porSucursal = (adm: Adm, meses = 3) =>
  rpc<SucursalQueDeja>(adm, 'direccion_por_sucursal', { p_meses: meses })

/* ── C.5 · LO QUE EL SISTEMA NO SABE ───────────────────────────────────── */

export type NoSeSabe = {
  que: string
  /** Cuántos hay HOY. Cero es «lo miré y no hay», y es lo que lo vuelve urgente. */
  cuantos: number
  que_lo_enciende: string
  href: string
}

export const noSeSabe = (adm: Adm) => rpc<NoSeSabe>(adm, 'direccion_no_se_sabe')

/* ── C.7 · QUÉ CAMBIÓ ──────────────────────────────────────────────────── */

export type Cambio = {
  que: string; cuantos: number; plata: number | null
  href: string; de_cuando: string
}

/**
 * Marca la visita y devuelve desde cuándo mirar.
 *
 * Va con el cliente de sesión, no con el de servicio: `panel_visitar` escribe
 * la fila de `auth.uid()` y no puede escribir la de nadie más.
 */
export async function visitar(sb: Adm): Promise<string | null> {
  const { data, error } = await sb.rpc('panel_visitar')
  if (error) { console.error(`[direccion] panel_visitar: ${error.message}`); return null }
  return (data ?? null) as string | null
}

export const queCambio = (adm: Adm, desde: string | null) =>
  desde === null
    ? Promise.resolve<Cambio[] | null>([])
    : rpc<Cambio>(adm, 'panel_que_cambio', { p_desde: desde })
