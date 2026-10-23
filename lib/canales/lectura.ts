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

/**
 * D · LA SALUD DEL CANAL.
 *
 * Cuatro de las cinco cosas que pide el bloque no se pueden medir hoy: el
 * tiempo de preparación (ningún pedido tiene marcados los dos momentos), el
 * motivo de las cancelaciones, el rating y los horarios. Se construyeron
 * igual y cada fila dice qué le falta — un tablero de salud sin el tiempo de
 * preparación, que no dice que le falta, hace creer que el canal está sano.
 *
 * Y la ventana viaja con el número: «0 pedidos en 90 días» y «no hay pedidos»
 * son dos cosas distintas, y la primera sin la ventana se lee como la segunda.
 */
export type SaludDeCanal = {
  canal_id: string; canal: string; sucursal: string | null
  pedidos: number; cancelados: number; cancelados_pct: number | null
  cancelados_por_stock: number; cancelados_sin_motivo: number
  minutos_preparacion: number | null; promete_minutos: number | null
  cumple: boolean | null; rating: number | null
  cerrado_hasta: string | null; cerrado_motivo: string | null
  responsable: string | null
  dias_mirados: number; pedidos_fuera_de_la_ventana: number
  que_no_se_puede_medir: string | null
}

export const saludDeCanales = (adm: Adm, dias = 90) =>
  rpc<SaludDeCanal>(adm, 'canal_salud', { p_dias: dias })

/* ────────────────────────────────────────────────────────────────────────────
 * v1.5 · LO QUE LA v1.4 CALCULÓ Y NO SE VEÍA.
 *
 * Nada de acá calcula: todo llama a una función que ya existía desde la v1.4 y
 * nunca tuvo pantalla. El único trabajo nuevo es tipar la salida, porque una
 * pantalla que lee `any` es una pantalla que el build no protege.
 * ──────────────────────────────────────────────────────────────────────────── */

/** G · cómo entra cada cosa a cada canal, y la distinción que importa. */
export type Conexion = {
  canal_id: string; canal: string
  /** `catálogo` · `pedidos` · `liquidaciones`. */
  que: string
  /** `api` · `archivo` · `a_mano` · `no_entra`. */
  como: string
  ultimo_dato: string | null; dias_sin_mover: number | null
  /**
   * `true` anda · `false` está roto · **`null` es «no entra a propósito»**.
   * Los tres son distintos y la pantalla los dibuja distinto: un `no_entra`
   * pintado de rojo manda a arreglar algo que está bien.
   */
  anda: boolean | null
  que_hacer: string | null
}

export const conexionesDeCanales = (adm: Adm) => rpc<Conexion>(adm, 'canales_conexiones')

/** E · los lotes de publicar y despublicar, con su firma. */
export type Lote = {
  id: string; canal_id: string; accion: 'publicar' | 'despublicar'
  estado: string; motivo: string | null
  armado_por: string | null; armado_at: string
  firmado_por: string | null; firmado_at: string | null; exportado_at: string | null
  plata_estimada: number | null; como_se_calculo: string | null
}

export type LoteItem = {
  lote_id: string; producto_id: string; sku: string | null; nombre: string
  precio_sugerido: number | null; plata: number | null; por_que: string | null
  sacado: boolean; sacado_motivo: string | null
}

export async function lotes(adm: Adm, limite = 50) {
  const { data, error } = await adm.from('canal_lotes')
    .select('*').order('armado_at', { ascending: false }).limit(limite)
  if (error) { console.error(`[canales] lotes: ${error.message}`); return null }
  return (data ?? []) as Lote[]
}

export async function itemsDeLote(adm: Adm, lote: string) {
  // `paginar` y no `.limit()`: un lote de despublicar puede traer los 1.790.
  try {
    const r = await paginar<LoteItem>(
      adm.from('canal_lote_items').select('*').eq('lote_id', lote).order('plata', { ascending: false, nullsFirst: false }),
      { maximo: 3_000 },
    )
    return r.filas
  } catch (e: any) {
    console.error(`[canales] items de lote: ${e?.message ?? e}`); return null
  }
}

/** E · lo que conviene publicar en un canal. El otro lado de los 1.790. */
export type ConvienePublicar = {
  producto_id: string; sku: string | null; nombre: string
  precio_mostrador: number; costo: number; precio_en_el_canal: number
  queda_para_el_negocio: number; vende_3m: number; stock: number
  plata_al_ano_si_se_vendiera_todo_ahi: number | null
  por_que: string; el_supuesto: string; de_cuantos_es_este: number
}

export const convienePublicar = (adm: Adm, canal: string, limite = 200) =>
  rpc<ConvienePublicar>(adm, 'canal_conviene_publicar', { p_canal: canal, p_limite: limite })

export const combos = (adm: Adm, canal: string, limite = 50) =>
  rpc<any>(adm, 'canal_combos', { p_canal: canal, p_limite: limite })

/** I · los errores que se cerraron y volvieron. Un error no se cierra solo. */
export type ErrorQueVuelve = {
  anomalia_id: string; detector: string; nombre_detector: string; clave: string
  veces: number; hecho: string; ultima_vez: string
  que_se_hizo_la_ultima_vez: string | null; hecho_de_proceso: string
}

export const erroresQueVuelven = (adm: Adm, veces = 2) =>
  rpc<ErrorQueVuelve>(adm, 'canal_errores_que_vuelven', { p_veces: veces })

/** I · el tablero de quien es responsable de un canal. */
export async function tableroResponsable(adm: Adm, user: string) {
  const { data, error } = await adm.rpc('canal_tablero_responsable', { p_user: user })
  if (error) { console.error(`[canales] tablero responsable: ${error.message}`); return null }
  return data as {
    canales: { canal_id: string; canal: string }[] | null
    errores_abiertos: number; vencidos: number; plata: number | null
    que_falta: string | null
  } | null
}

/** H · el histórico del importador: qué entró y qué quedó crudo. */
export type Importacion = {
  id: string; canal_id: string | null; tipo: string; archivo: string
  perfil_id: string | null; entro_solo: boolean
  huella: string | null; encabezados: string[] | null
  filas_totales: number | null; filas_leidas: number | null; filas_crudas: number | null
  estado: string
  subido_at: string; confirmado_at: string | null
  resumen: Record<string, unknown> | null
}

export async function importaciones(adm: Adm, limite = 60) {
  const { data, error } = await adm.from('archivo_importaciones')
    .select('*').order('subido_at', { ascending: false }).limit(limite)
  if (error) { console.error(`[canales] importaciones: ${error.message}`); return null }
  return (data ?? []) as Importacion[]
}

export type FilaImportada = {
  id: string; importacion_id: string; nro_fila: number
  datos: Record<string, unknown> | null
  /** El original, siempre. También el de las filas que sí se entendieron. */
  crudo: string | null
  se_entendio: boolean; por_que_no: string | null
}

export async function filasDe(adm: Adm, importacion: string, maximo = 500) {
  try {
    const r = await paginar<FilaImportada>(
      adm.from('archivo_filas').select('*').eq('importacion_id', importacion).order('nro_fila'),
      { maximo },
    )
    return r.filas
  } catch (e: any) {
    console.error(`[canales] filas: ${e?.message ?? e}`); return null
  }
}

export type Diferencia = {
  id: string; importacion_id: string; canal_id: string; tipo: string
  clave: string | null; sku: string | null; fecha: string | null
  /** Los dos lados. Una diferencia con un solo lado no se puede revisar. */
  dice_el_archivo: string | null; dice_nora: string | null
  monto: number | null; hecho: string; que_no_dice: string; estado: string
}

export async function diferenciasDe(adm: Adm, importacion: string) {
  const { data, error } = await adm.from('archivo_diferencias')
    .select('*').eq('importacion_id', importacion).order('monto', { ascending: false, nullsFirst: false }).limit(500)
  if (error) { console.error(`[canales] diferencias: ${error.message}`); return null }
  return (data ?? []) as Diferencia[]
}

/** H · los formatos aprendidos, uno por plataforma y tipo de archivo. */
export type PerfilAprendido = {
  id: string; nombre: string; canal_id: string | null; tipo: string
  encabezados: string[] | null; huella: string | null
  veces_usado: number | null; ultima_carga: string | null
  ultima_huella_distinta: string | null; ultima_huella_distinta_at: string | null
}

export async function perfilesAprendidos(adm: Adm) {
  const { data, error } = await adm.from('perfiles_datos')
    .select('id, nombre, canal_id, tipo, encabezados, huella, veces_usado, ultima_carga, ultima_huella_distinta, ultima_huella_distinta_at')
    .not('canal_id', 'is', null).order('veces_usado', { ascending: false, nullsFirst: false })
  if (error) { console.error(`[canales] perfiles: ${error.message}`); return null }
  return (data ?? []) as PerfilAprendido[]
}

/** I · los plazos declarados por detector. Para que la pantalla no los invente. */
export async function plazosDeDetectores(adm: Adm) {
  const { data, error } = await adm.from('detectores')
    .select('clave, nombre, dias_para_resolver, siempre_arriba, tope_diario')
    .eq('familia', 'canal').eq('activo', true).order('orden')
  if (error) { console.error(`[canales] plazos: ${error.message}`); return null }
  return (data ?? []) as {
    clave: string; nombre: string; dias_para_resolver: number | null
    siempre_arriba: boolean; tope_diario: number | null
  }[]
}

/**
 * I · LOS ERRORES CON SU SEGUIMIENTO.
 *
 * `deteccion_hallazgos()` no devuelve el plazo ni el responsable: es la lectura
 * del tablero de detección y esos dos campos son de canales. Se leen de
 * `anomalias` directo —es una lectura, no un cálculo— y se juntan con el plazo
 * declarado en `detectores.dias_para_resolver`.
 *
 * El vencimiento NO se recalcula acá. `vence_at` lo escribe la corrida cuando
 * publica el hallazgo; si la pantalla lo volviera a calcular, dos lugares
 * dirían cuándo vence y el que esté mal va a ser el que se mire.
 */
export type ErrorConSeguimiento = {
  id: string; detector: string; clave: string
  hecho: string; plata_en_juego: number | null; como_se_calculo: string | null
  estado: string
  primera_vez: string; ultima_vez: string; publicado_at: string | null
  veces_reaparecio: number
  vence_at: string | null
  que_se_hizo: string | null; resuelta_at: string | null
  no_se_puede_motivo: string | null
  responsable_user_id: string | null
  sucursal_id: string | null
  costo_real: number | null; costo_de_donde: string | null
}

export async function erroresConSeguimiento(adm: Adm, opts: {
  estados?: string[]; maximo?: number
} = {}) {
  const estados = opts.estados ?? ['abierta', 'reaparecio']
  try {
    // `paginar<any>` y no `<ErrorConSeguimiento>`: el tipo generado de
    // PostgREST no conoce estas columnas y el genérico choca. El cast al
    // devolver es el mismo patrón que `catalogoDeCanal`.
    const r = await paginar<any>(
      adm.from('anomalias')
        .select('id, detector, clave, hecho, plata_en_juego, como_se_calculo, estado, ' +
          'primera_vez, ultima_vez, publicado_at, veces_reaparecio, vence_at, que_se_hizo, ' +
          'resuelta_at, no_se_puede_motivo, responsable_user_id, sucursal_id, costo_real, costo_de_donde')
        .in('detector', [
          'canal_legal_publicado', 'canal_apagado_con_stock', 'canal_sin_stock',
          'canal_no_actualiza', 'canal_mal_cargado', 'canal_rechazado',
        ])
        .in('estado', estados)
        // Lo vencido primero, después por plata. `nullsFirst: false` para que
        // los que no tienen plata no encabecen la lista — es la lección de la
        // v1.3: `nulls last` publicaba hallazgos sin plata arriba de todo.
        .order('vence_at', { ascending: true, nullsFirst: false })
        .order('plata_en_juego', { ascending: false, nullsFirst: false }),
      { maximo: opts.maximo ?? 3_000 },
    )
    return r.filas as ErrorConSeguimiento[]
  } catch (e: any) {
    console.error(`[canales] errores con seguimiento: ${e?.message ?? e}`)
    return null
  }
}
