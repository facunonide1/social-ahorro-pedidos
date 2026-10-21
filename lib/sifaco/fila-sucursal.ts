import { codigoSifaco, fechaSifaco, numeroSifaco } from './columnas'
import {
  MESES_ARCHIVO, SUCURSALES_ARCHIVO, type MapaDeColumnas,
} from './columnas-sucursales'

/**
 * UNA FILA DEL MAESTRO POR SUCURSAL, NORMALIZADA.
 *
 * ── POR QUÉ ESTO ESTÁ ACÁ Y NO EN CADA LADO ─────────────────────────────────
 *
 * Lo usan dos transportes: el script de terminal —que lee el .xls del repo— y
 * la pantalla, que lo lee en el navegador de quien lo sube. Es la misma doctrina
 * que `fila.ts` para el maestro anterior: si cada uno tuviera su normalizador,
 * en la tercera corrección habría dos catálogos distintos y ninguno sería el
 * bueno.
 *
 * Lo único que cambia entre los dos es cómo llega el archivo.
 */

export interface FilaSucursal {
  fila: number
  codigo: string
  nombre: string | null
  descripx: string | null
  barras: string | null
  barras2: string | null
  barras3: string | null
  barras4: string | null
  costo: number | null
  precio: number | null
  neto: number | null
  gcom: number | null
  stk_guz: number | null
  stk_fig: number | null
  stk_ara: number | null
  stk_tes: number | null
  stk_tot: number | null
  ventas: Record<string, number>
  prefijo: string | null
  vl: string | null
  status: string | null
  nopedir: boolean
  nom_gru: string | null
  seccion: string | null
  categoria: string | null
  unine_3: string | null
  categ_3: string | null
  segme_3: string | null
  ssegm_3: string | null
  marca_3: string | null
  promo_3: string | null
  codlab: string | null
  nomlab: string | null
  nom_dep: string | null
  familia: string | null
  droga: string | null
  fec_actu: string | null
}

/**
 * El código de barras viene rellenado con espacios y a veces es sólo «0».
 *
 * Un «0» no es un código de barras: es la celda vacía escrita de otra forma.
 * Entra como null, para que no haya 20.000 productos compartiendo el código 0.
 */
export function barrasSifaco(v: unknown): string | null {
  const t = String(v ?? '').trim()
  if (!t || t === '0' || !/^\d{6,14}$/.test(t)) return null
  return t
}

export function textoSifaco(v: unknown): string | null {
  const t = String(v ?? '').trim()
  return t || null
}

/**
 * Normaliza una fila contra el mapa de columnas ya resuelto.
 *
 * Devuelve null cuando la fila no tiene código: sin código no se puede cruzar
 * con nada, y una fila así no es un producto — es el pie del reporte o una
 * línea en blanco que el lector dejó pasar.
 */
export function normalizarFilaSucursal(
  f: unknown[], indiceFila: number, mapa: MapaDeColumnas,
): FilaSucursal | null {
  const val = (c: string): unknown => {
    const i = mapa.indice[c]
    return i === undefined ? null : f[i]
  }

  const codigo = codigoSifaco(val('CODIGO'))
  if (!codigo) return null

  const ventas: Record<string, number> = {}
  for (const s of SUCURSALES_ARCHIVO) {
    for (const m of MESES_ARCHIVO) {
      const v = numeroSifaco(val(`${s}_${m.sufijo}`))
      // Sólo lo que vendió. Un cero acá es «no vendió», que ya lo dice la
      // ausencia de la clave: guardar 16 ceros por producto son 770.000 filas
      // que no agregan un hecho.
      if (v) ventas[`${s}_${m.sufijo}`] = v
    }
  }

  return {
    fila: indiceFila,
    codigo,
    nombre: textoSifaco(val('NOMBRE')),
    descripx: textoSifaco(val('DESCRIPX')),
    barras: barrasSifaco(val('BARRAS')),
    barras2: barrasSifaco(val('BARRAS_2')),
    barras3: barrasSifaco(val('BARRAS_3')),
    barras4: barrasSifaco(val('BARRAS_4')),
    costo: numeroSifaco(val('COSTO')),
    precio: numeroSifaco(val('PRECIO')),
    neto: numeroSifaco(val('NETO')),
    gcom: numeroSifaco(val('GCOM')),
    stk_guz: numeroSifaco(val('GUZ_STK')),
    stk_fig: numeroSifaco(val('FIG_STK')),
    stk_ara: numeroSifaco(val('ARA_STK')),
    stk_tes: numeroSifaco(val('TES_STK')),
    stk_tot: numeroSifaco(val('TOT_STK')),
    ventas,
    prefijo: textoSifaco(val('PREFIJO')),
    vl: textoSifaco(val('VL')),
    status: textoSifaco(val('STATUS')),
    nopedir: !!textoSifaco(val('NOPEDIR')),
    nom_gru: textoSifaco(val('NOM_GRU')),
    seccion: textoSifaco(val('SECCION')),
    categoria: textoSifaco(val('CATEGORIA')),
    unine_3: textoSifaco(val('UNINE_3')),
    categ_3: textoSifaco(val('CATEG_3')),
    segme_3: textoSifaco(val('SEGME_3')),
    ssegm_3: textoSifaco(val('SSEGM_3')),
    marca_3: textoSifaco(val('MARCA_3')),
    promo_3: textoSifaco(val('PROMO_3')),
    codlab: textoSifaco(val('CODLAB')),
    nomlab: textoSifaco(val('NOMLAB')),
    nom_dep: textoSifaco(val('NOM_DEP')),
    familia: textoSifaco(val('FAMILIA')),
    droga: textoSifaco(val('DROGA')),
    fec_actu: fechaSifaco(val('FEC_ACTU')),
  }
}

/**
 * Lo que hace falta para verificar, calculado en la misma pasada.
 *
 * Se devuelve junto con las filas porque recorrer 48.127 filas dos veces —una
 * para normalizar y otra para contar— es media pasada de más sobre 35 MB en el
 * navegador de alguien que está esperando.
 */
export interface ResumenDelArchivo {
  filas: number
  /** La fecha del archivo, del máximo FEC_ACTU: sale del propio dato. */
  fechaArchivo: string | null
  gruposNomGru: { valor: string; filas: number }[]
  valorCosto: number
  duplicados: { codigo: string; veces: number }[]
  /** Cuántas descripciones tienen la codificación rota. En este layout: cero. */
  conMojibake: number
}

export function normalizarArchivoSucursales(
  filas: unknown[][], mapa: MapaDeColumnas, desdeFila = 1,
): { filas: FilaSucursal[]; resumen: ResumenDelArchivo } {
  const vistos = new Map<string, number>()
  const grupos = new Map<string, number>()
  const salida: FilaSucursal[] = []
  let fechaArchivo: string | null = null
  let valorCosto = 0
  let conMojibake = 0
  let total = 0

  for (let i = desdeFila; i < filas.length; i++) {
    const f = filas[i]
    if (!f) continue
    const n = normalizarFilaSucursal(f, i, mapa)
    if (!n) continue
    total++

    const veces = (vistos.get(n.codigo) ?? 0) + 1
    vistos.set(n.codigo, veces)

    const g = n.nom_gru ?? ''
    grupos.set(g, (grupos.get(g) ?? 0) + 1)
    if (n.fec_actu && (!fechaArchivo || n.fec_actu > fechaArchivo)) fechaArchivo = n.fec_actu
    if (n.costo) valorCosto += (n.stk_tot ?? 0) * n.costo
    if (/[ÃÂ]|ï¿½|�/.test(`${n.nombre ?? ''}${n.descripx ?? ''}`)) conMojibake++

    // La segunda aparición de un código NO se carga: se cuenta y se reporta.
    // Pisar en silencio dejaría la última, que no es más confiable que la
    // primera — simplemente es la que quedó.
    if (veces > 1) continue
    salida.push(n)
  }

  return {
    filas: salida,
    resumen: {
      filas: total,
      fechaArchivo,
      gruposNomGru: [...grupos.entries()].map(([valor, f]) => ({ valor, filas: f })),
      valorCosto,
      duplicados: [...vistos.entries()].filter(([, n]) => n > 1).map(([codigo, veces]) => ({ codigo, veces })),
      conMojibake,
    },
  }
}
