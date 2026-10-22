/**
 * LOS CANALES.
 *
 * ── POR QUÉ EL MOSTRADOR ES UN CANAL ────────────────────────────────────────
 *
 * Porque todo el bloque C compara contra él. «Este canal deja menos que el
 * mostrador» necesita que el mostrador sea una fila con comisión 0 y recargo
 * 0, no una excepción escrita en cada consulta.
 *
 * ── Y POR QUÉ `publicados` PUEDE SER NULL ───────────────────────────────────
 *
 * Porque dos de los cinco canales no tienen catálogo cargado. Cero sería «lo
 * miré y no hay nada publicado»; null es «no lo puedo saber». La pantalla los
 * muestra distinto: el cero va como número y el null va con qué le falta.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

import { paginar } from '@/lib/supabase/paginar'

export type CanalEstado = {
  canal_id: string; nombre: string; tipo: string; activo: boolean
  catalogo_cargado: boolean
  publicados: number | null; activos: number | null; apagados: number | null
  comision_pct: number; comision_confirmada: boolean; comision_de_donde: string | null
  recargo_pct: number; recargo_cubre_comision: boolean | null
  ultima_sincronizacion: string | null; dias_sin_mover: number | null
  sincroniza_como: string | null
  de_donde_sale_el_conteo: string | null; que_falta: string | null
}

export type CanalDeProducto = {
  canal_id: string; canal: string; esta_publicado: boolean; estado: string | null
  precio_mostrador: number | null; recargo_pct: number
  precio_que_corresponde: number | null; precio_publicado: number | null
  diferencia: number | null
  stock_publicado: number | null; stock_sifaco: number
  desde: string | null; permalink: string | null; que_no_se_sabe: string | null
}

export type Comparacion = {
  sku: string; nombre: string; en_a: boolean; en_b: boolean
  estado_a: string | null; estado_b: string | null
  precio_a: number | null; precio_b: number | null; stock_sifaco: number
  solo_en: string | null; por_que_puede_ser: string | null
}

type Adm = Pick<SupabaseClient, 'rpc' | 'from'>

/**
 * Igual que en detección: si la consulta falla devuelve null y la pantalla
 * dice que no pudo mirar. Es la lección de la v0.99 — `?? {}` sobre un error
 * deja todo en cero y la pantalla afirma que no hay nada.
 */
async function rpc<T>(adm: Adm, fn: string, args?: Record<string, unknown>): Promise<T[] | null> {
  const { data, error } = await adm.rpc(fn, args ?? {})
  if (error) { console.error(`[canales] ${fn}: ${error.message}`); return null }
  return (data ?? []) as T[]
}

export const estadoDeCanales = (adm: Adm) => rpc<CanalEstado>(adm, 'canales_estado')

export const canalesDeProducto = (adm: Adm, producto: string) =>
  rpc<CanalDeProducto>(adm, 'producto_canales', { p_producto: producto })

export const compararCanales = (adm: Adm, a: string, b: string) =>
  rpc<Comparacion>(adm, 'canales_comparar', { p_a: a, p_b: b })

/**
 * A.2 · El catálogo de un canal. Pagina porque 7.737 publicaciones pasan el
 * corte de 1.000 filas de PostgREST sin avisar — el error que mordió cinco
 * veces en este proyecto.
 */
const COLS_CATALOGO =
  'sku, nombre_canal, producto, estado, precio_mostrador, precio_publicado, ' +
  'precio_calculado, costo, stock_sifaco, stock_publicado, cubre_costo, ' +
  'problema, permalink, por_que_no_se_sabe'

export async function catalogoDeCanal(adm: Adm, canal: string, opts: {
  problema?: string | null; maximo?: number
} = {}) {
  try {
    // `paginar` y no `.limit()`: 7.737 publicaciones pasan el corte de 1.000
    // filas de PostgREST sin avisar, y ese error ya mordió cinco veces en este
    // proyecto. Es además el patrón que el auditor de cortes reconoce.
    const r = opts.problema
      ? await paginar<any>(adm.from('canal_estado').select(COLS_CATALOGO)
          .eq('canal_id', canal).eq('problema', opts.problema).order('sku'),
          { maximo: opts.maximo ?? 5_000 })
      : await paginar<any>(adm.from('canal_estado').select(COLS_CATALOGO)
          .eq('canal_id', canal).order('sku'),
          { maximo: opts.maximo ?? 5_000 })
    return r.filas
  } catch (e: any) {
    console.error(`[canales] catalogo ${canal}: ${e?.message ?? e}`)
    return null
  }
}

export async function problemasDeCanal(adm: Adm, canal: string) {
  const { data, error } = await adm.from('canal_problemas')
    .select('problema, casos').eq('canal_id', canal).order('casos', { ascending: false }).limit(50)
  if (error) { console.error(`[canales] problemas ${canal}: ${error.message}`); return null }
  return (data ?? []) as { problema: string; casos: number }[]
}
