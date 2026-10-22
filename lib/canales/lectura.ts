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

/**
 * B · LOS ERRORES DEL CATÁLOGO.
 *
 * ── POR QUÉ NO HAY UNA LISTA PROPIA ────────────────────────────────────────
 *
 * Porque los seis errores del bloque B son exactamente lo que la v1.3
 * construyó: un hecho, con plata al lado, ordenado por plata, con tope para
 * que no sea ruido, con descarte que le enseña al detector y con marcador.
 *
 * Entraron al catálogo de `detectores` en la familia `canal`. Dos listas de
 * errores del catálogo serían dos lugares donde mirar lo mismo, y la que esté
 * desactualizada va a ser siempre la que menos se mira.
 */
export type ErrorDeCanal = {
  id: string; detector: string; nombre_detector: string; familia: string
  clave: string; sucursal_id: string | null; sucursal: string | null
  producto_id: string | null
  hecho: string; plata: number | null; como_se_calculo: string | null
  que_no_dice: string; estado: string
  visto_primero: string; visto_ultimo: string; publicado_at: string | null
  veces_reaparecio: number; aviso_href: string | null
}

export function erroresDeCanal(adm: Adm, opts: {
  soloPublicados?: boolean; limite?: number
} = {}) {
  return rpc<ErrorDeCanal>(adm, 'deteccion_hallazgos', {
    p_familia: 'canal',
    p_sucursal: null,
    p_solo_publicados: opts.soloPublicados ?? false,
    p_limite: opts.limite ?? 300,
  })
}

export async function conflictoLegal(adm: Adm) {
  const { data, error } = await adm.rpc('canal_campos_legales_en_conflicto')
  if (error) { console.error(`[canales] conflicto legal: ${error.message}`); return null }
  return data as {
    en_conflicto: number
    publicados_si_se_mira_el_booleano: number
    publicados_si_se_mira_la_condicion: number
    publicados_con_el_criterio_conservador: number
    que_criterio_se_usa: string
    por_que_no_se_arregla: string
  } | null
}

/**
 * C · CUÁNTO DEJA CADA CANAL.
 *
 * ── EL NÚMERO QUE CONTESTA EL BLOQUE ────────────────────────────────────────
 *
 * El recargo que haría falta para igualar al mostrador **no es igual a la
 * comisión**. Con 24% de comisión hace falta 31,6% de recargo, no 24%, porque
 * la comisión se cobra sobre el precio ya recargado: cobrar un 24% más no
 * compensa que te saquen el 24% de ese total.
 *
 * El recargo de PedidosYa es 19%. La brecha no es de 5 puntos: es de 12,6.
 */
export type RecargoVsComision = {
  canal_id: string; canal: string
  recargo_pct: number; comision_pct: number; diferencia_pts: number
  cubre: boolean; comision_confirmada: boolean
  recargo_que_haria_falta: number | null; hecho: string
}

export type ResultadoPorMes = {
  canal_id: string; canal: string; mes: string
  pedidos: number; venta: number; comision: number; costo: number
  resultado: number; resultado_pct: number | null
  pedidos_extremos: number; venta_de_los_extremos: number
  que_no_se_sabe: string | null
}

export type NoConviene = {
  canal_id: string; canal: string; producto_id: string
  sku: string | null; nombre: string
  precio_mostrador: number; costo: number
  precio_en_el_canal: number; queda_para_el_negocio: number
  resultado_mostrador: number; diferencia: number
  vende_3m: number; plata_al_ano_si_se_vendiera_todo_ahi: number | null
  pierde_plata: boolean; medido_o_proyectado: 'medido' | 'proyectado'
  hecho: string; el_supuesto: string; de_cuantos_es_este: number
}

export type NoSePuede = {
  que: string; cuantos: number | null; el_numero: string; que_lo_enciende: string
}

export const recargoVsComision = (adm: Adm) =>
  rpc<RecargoVsComision>(adm, 'canal_recargo_vs_comision')

export const resultadoPorMes = (adm: Adm, meses = 12) =>
  rpc<ResultadoPorMes>(adm, 'canal_resultado_por_mes', { p_meses: meses })

/**
 * Acotado a propósito, y cada fila dice de cuántos es.
 *
 * Sin límite la función devuelve 24.788 filas y PostgREST entrega 1.000 sin
 * avisar — el corte silencioso que este proyecto persigue desde la v0.98. El
 * auditor de cortes mira el código TypeScript y no ve los RPC, así que el
 * límite tiene que estar del lado de la base y venir declarado.
 */
export const noConviene = (adm: Adm, canal?: string | null, limite = 200) =>
  rpc<NoConviene>(adm, 'canal_producto_no_conviene',
    { p_canal: canal ?? null, p_limite: limite })

export const noConvieneResumen = (adm: Adm) =>
  rpc<any>(adm, 'canal_no_conviene_resumen')

export const loQueNoSePuedeCalcular = (adm: Adm) =>
  rpc<NoSePuede>(adm, 'canal_lo_que_no_se_puede_calcular')

export const ventasExtremas = (adm: Adm) =>
  rpc<any>(adm, 'canal_ventas_extremas')

export async function desglosePedido(adm: Adm, order: string) {
  const { data, error } = await adm.rpc('canal_desglose_pedido', { p_order: order })
  if (error) { console.error(`[canales] desglose: ${error.message}`); return null }
  return data as any
}

export const mismoPedidoEnOtros = (adm: Adm, order: string) =>
  rpc<any>(adm, 'canal_mismo_pedido_en_otros', { p_order: order })
