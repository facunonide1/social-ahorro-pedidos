/**
 * LAS OFERTAS DE SIFACO: LA FORMA DEL DESCUENTO, NO SÓLO EL NÚMERO.
 *
 * ── LO QUE SE DESCUBRIÓ AL MIRAR EL ARCHIVO ─────────────────────────────────
 *
 * `tip_o1` no es un adorno: dice CÓMO se aplica el descuento, y son seis formas
 * distintas, no una.
 *
 *     '%'  5.583   directo
 *     ''     690   sin tipo declarado
 *     '2'    167   en la SEGUNDA unidad
 *     '$'     18   pesos fijos
 *     '3'      4   en la TERCERA unidad
 *     '6'      1   SIFACO no documenta qué es
 *
 * Un `2` con valor 50 NO es 50% de descuento: es «50% en la segunda unidad», o
 * sea 25% efectivo llevando dos. Si los 190 casos de `2`, `3` y `$` entran como
 * descuento directo, el margen calculado queda mal justo ahí — y las alertas de
 * bajo costo, que es lo que uno quiere que funcione, también.
 *
 * ── LO QUE NO SE INTERPRETA ─────────────────────────────────────────────────
 *
 * El `'6'` aparece en un producto bonificado y SIFACO no documenta qué es. No
 * se adivina: el descuento efectivo queda en `null`. `null` es «no lo sé»; un
 * `0` sería «no hay descuento», y son cosas distintas.
 *
 * Los 690 sin tipo se tratan como directos —es lo más probable— pero queda
 * declarado en `sifaco_forma_descuento` que eso es una suposición nuestra y no
 * un dato de SIFACO.
 */

import { numeroSifaco, codigoSifaco, fechaSifaco } from './columnas'

/** El índice de cada columna, por nombre de encabezado. */
export type Indice = Record<string, number>

export interface FormaDescuento {
  tip_sifaco: string
  forma: string
  divisor: number
  es_pesos: boolean
  interpretable: boolean
}

export interface CondicionVenta {
  vl_sifaco: string
  condicion: string
  canal_abierto: boolean
}

export interface OfertaLeida {
  codigo: string
  descrip: string | null
  valor: number | null
  tip_sifaco: string
  descuento_efectivo_pct: number | null
  precio_lista: number | null
  precio_con_descuento: number | null
  costo: number | null
  desde: string | null
  hasta: string | null
  estado: 'vigente' | 'vencida' | 'sin_vencimiento' | 'futura'
  oferta2_cruda: Record<string, unknown> | null
  stock: number | null
  barras: string | null
  condicion_venta: string
  publicable: boolean
}

/**
 * El descuento efectivo, resuelto POR LA FORMA.
 *
 * Devuelve `null` cuando la forma no se puede interpretar. Quien llame tiene
 * que distinguir eso de un cero.
 */
export function descuentoEfectivo(
  valor: number | null,
  precio: number | null,
  forma: FormaDescuento | undefined,
): { pct: number | null; precioFinal: number | null } {
  if (valor === null || valor === 0 || !precio || !forma) return { pct: null, precioFinal: null }
  if (!forma.interpretable) return { pct: null, precioFinal: null }

  if (forma.es_pesos) {
    const pct = precio > 0 ? valor / precio : null
    return { pct: pct === null ? null : pct * 100, precioFinal: precio - valor }
  }

  // El divisor es cuántas unidades hay que llevar: 2 para «en la segunda».
  const pct = valor / (forma.divisor || 1)
  return { pct, precioFinal: precio * (1 - pct / 100) }
}

/**
 * Las tres condiciones que convierten una oferta declarada en una usable:
 * que haya stock de verdad, que tenga con qué escanearse, y que se pueda
 * ofrecer por un canal abierto.
 *
 * La tercera es la regla de oro 9: nada que requiera receta se ofrece ni se
 * encarga por chat. Ante una condición sin declarar, NO se ofrece.
 */
export function esPublicable(
  stock: number | null,
  barras: string | null,
  cond: CondicionVenta | undefined,
): boolean {
  if ((stock ?? 0) <= 2) return false
  const b = (barras ?? '').trim()
  if (!b || b === '0') return false
  return cond?.canal_abierto === true
}

function estadoDeVigencia(desde: string | null, hasta: string | null, hoy: string): OfertaLeida['estado'] {
  if (!hasta) return 'sin_vencimiento'
  if (desde && desde > hoy) return 'futura'
  return hasta < hoy ? 'vencida' : 'vigente'
}

/** Una fila del CSV de ofertas → una oferta. */
export function leerOferta(
  fila: unknown[],
  I: Indice,
  formas: Map<string, FormaDescuento>,
  condiciones: Map<string, CondicionVenta>,
  hoy: string,
): OfertaLeida | null {
  const codigo = codigoSifaco(fila[I.codigo])
  if (!codigo) return null

  const valor = numeroSifaco(fila[I.oferta1])
  if (valor === null || valor === 0) return null   // sin descuento no es una oferta

  const tip = String(fila[I.tip_o1] ?? '').trim()
  const forma = formas.get(tip)
  const precio = numeroSifaco(fila[I.publico])
  const { pct, precioFinal } = descuentoEfectivo(valor, precio, forma)

  const stock = numeroSifaco(fila[I.stock])
  const barras = String(fila[I.barras] ?? '').trim() || null
  const vl = String(fila[I.vl] ?? '').trim()
  const cond = condiciones.get(vl)

  const desde = fechaSifaco(fila[I.fi_o1])
  const hasta = fechaSifaco(fila[I.fv_o1])

  // `oferta2` va CRUDA. SIFACO no declara qué es y `tip_o2` viene vacío en
  // 11.404 de 11.405: interpretarla sería inventar un segundo descuento.
  const o2 = numeroSifaco(fila[I.oferta2])
  const oferta2Cruda = o2 === null || o2 === 0 ? null : {
    valor: o2,
    tip_o2: String(fila[I.tip_o2] ?? '').trim() || null,
    fi_o2: fechaSifaco(fila[I.fi_o2]),
    fv_o2: fechaSifaco(fila[I.fv_o2]),
    nota: 'sin interpretar: SIFACO no declara que es este campo',
  }

  return {
    codigo,
    descrip: String(fila[I.descrip] ?? '').trim() || null,
    valor,
    tip_sifaco: tip,
    descuento_efectivo_pct: pct === null ? null : Math.round(pct * 100) / 100,
    precio_lista: precio,
    precio_con_descuento: precioFinal === null ? null : Math.round(precioFinal * 100) / 100,
    costo: numeroSifaco(fila[I.costo]),
    desde,
    hasta,
    estado: estadoDeVigencia(desde, hasta, hoy),
    oferta2_cruda: oferta2Cruda,
    stock,
    barras,
    condicion_venta: cond?.condicion ?? 'sin_declarar',
    publicable: esPublicable(stock, barras, cond),
  }
}

/** La huella del archivo: los encabezados en orden, para reconocerlo solo. */
export function huellaDeEncabezados(enc: string[]): string {
  return enc.map((c) => String(c ?? '').trim().toLowerCase()).join('|')
}
