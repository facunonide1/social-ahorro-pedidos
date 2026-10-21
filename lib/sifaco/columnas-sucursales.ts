/**
 * EL LAYOUT DEL MAESTRO ABIERTO POR SUCURSAL.
 *
 * ── POR QUÉ ESTE MAPA VA POR NOMBRE Y EL OTRO POR ÍNDICE ────────────────────
 *
 * `columnas.ts` mapea `pla_3d_24` POR ÍNDICE, y el motivo está escrito ahí: los
 * encabezados venían con la codificación rota, y aparear por un texto que hay
 * que arreglar antes de poder compararlo es apoyar el mapa en lo que estamos
 * arreglando.
 *
 * Este archivo es distinto y el criterio cambia con el archivo. Sus encabezados
 * son códigos ASCII de SIFACO —`GUZ_STK`, `TOT_STK`, `NOPEDIR`— y la
 * codificación no los toca. Un índice fijo para 59 columnas que nadie vio
 * todavía sería una suposición sobre el orden; un nombre es un hecho sobre el
 * contenido.
 *
 * Y hay una razón más fuerte: si SIFACO exporta las columnas en otro orden —o
 * agrega una— el mapa por índice carga mal SIN AVISAR. El mapa por nombre no
 * puede: una columna que no está es un error, y el archivo no entra.
 *
 * ── LO QUE ESTE MÓDULO NO DECIDE ────────────────────────────────────────────
 *
 * A qué sucursal de NORA corresponde cada código. Eso vive en
 * `sucursales.codigo_sifaco`, lo declaró el dueño, y acá no se adivina.
 */

/** Los cuatro códigos con los que SIFACO nombra a las sucursales. */
export const SUCURSALES_ARCHIVO = ['GUZ', 'FIG', 'ARA', 'TES'] as const
export type CodigoArchivo = (typeof SUCURSALES_ARCHIVO)[number]

/**
 * Los cuatro meses que trae el archivo, del más nuevo al más viejo.
 *
 * `ACTU` es el mes en curso y viene CORTADO: 22.994 unidades contra ~50.000 de
 * los tres cerrados. Es el mismo caso que `ago25` en el maestro anterior, y la
 * misma consecuencia si se ignora: cualquier promedio que lo incluya como mes
 * normal queda mal y nadie lo nota. Entra marcado `parcial` y no promedia.
 *
 * El período se calcula contra la fecha del ARCHIVO, no contra hoy: un archivo
 * del 14 de octubre tiene `ACTU` = octubre aunque se importe en diciembre.
 */
export const MESES_ARCHIVO = [
  { sufijo: 'ACTU', offset: 0, parcial: true },
  { sufijo: 'SEP', offset: -1, parcial: false },
  { sufijo: 'AGO', offset: -2, parcial: false },
  { sufijo: 'JUL', offset: -3, parcial: false },
] as const

/**
 * El período `AAAA-MM` de cada mes del archivo, contado desde su fecha.
 *
 * Los sufijos del archivo son nombres de mes (`SEP`, `AGO`, `JUL`) y el offset
 * dice cuántos meses atrás del archivo cae cada uno. Se verifica que coincidan:
 * si el archivo es de octubre, `SEP` tiene que caer en septiembre. Si no
 * coincide, el archivo no es del mes que dice y eso hay que verlo antes de
 * cargar cuatro meses de ventas en los períodos equivocados.
 */
const NOMBRE_MES: Record<string, number> = {
  ENE: 1, FEB: 2, MAR: 3, ABR: 4, MAY: 5, JUN: 6,
  JUL: 7, AGO: 8, SEP: 9, OCT: 10, NOV: 11, DIC: 12,
}

export function periodosDelArchivo(fechaArchivo: string): {
  sufijo: string; periodo: string; parcial: boolean; coherente: boolean
}[] {
  const [a, m] = fechaArchivo.slice(0, 7).split('-').map(Number)
  return MESES_ARCHIVO.map(({ sufijo, offset, parcial }) => {
    const d = new Date(Date.UTC(a, m - 1 + offset, 1))
    const periodo = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    const esperado = NOMBRE_MES[sufijo]
    return {
      sufijo,
      periodo,
      parcial,
      // `ACTU` no nombra un mes, así que no hay nada que comparar: es coherente
      // por definición. Los otros tres sí, y ahí la comparación es la prueba.
      coherente: esperado === undefined ? true : esperado === d.getUTCMonth() + 1,
    }
  })
}

/**
 * Las columnas que el archivo TIENE QUE traer para poder importarlo.
 *
 * Si falta una, no se carga nada: una importación a la que le falta el stock de
 * una sucursal deja esa sucursal en cero, y cero quiere decir «lo miré y no
 * hay». Mentiría sobre un local entero.
 */
export const COLUMNAS_OBLIGATORIAS: string[] = [
  'CODIGO',
  ...SUCURSALES_ARCHIVO.map((s) => `${s}_STK`),
  'TOT_STK',
  ...SUCURSALES_ARCHIVO.flatMap((s) => MESES_ARCHIVO.map((m) => `${s}_${m.sufijo}`)),
]

/**
 * Las que se usan si están y no se extrañan si no: cambian lo que se puede
 * mostrar, no si el archivo entra.
 */
export const COLUMNAS_OPCIONALES: string[] = [
  // Los nombres son los del encabezado REAL de `tabla3e`, verificados contra el
  // archivo del 14-10. La primera versión de esta lista decía `DESCRIP`,
  // `PREC_VTA` y `PUBLICO` —los nombres del maestro viejo— y esas tres columnas
  // no existen acá: el nombre es `NOMBRE`, `PRECIO`, y público no viene. El
  // mapa resolvía 41 de 59 y tres campos entraban en null sin que nada fallara.
  // Lo delató el propio informe de columnas sin usar, que es para qué está.
  'NOMBRE', 'DESCRIPX', 'BARRAS', 'BARRAS_2', 'BARRAS_3', 'BARRAS_4',
  'COSTO', 'PRECIO', 'NETO', 'GCOM', 'PREFIJO',
  'VL', 'STATUS', 'NOPEDIR', 'NOM_GRU', 'FEC_ACTU',
  'SECCION', 'CATEGORIA', 'CODLAB', 'NOMLAB', 'NOM_DEP', 'FAMILIA', 'DROGA',
  'UNINE_3', 'CATEG_3', 'SEGME_3', 'SSEGM_3', 'MARCA_3', 'PROMO_3',
  // Los totales por mes que declara el archivo. No se guardan: se usan para
  // cruzar contra la suma de las cuatro sucursales. En el mes en curso difieren
  // en 10 unidades, y eso es un hecho sobre el archivo que conviene ver.
  'TOT_ACTU', 'TOT_SEP', 'TOT_AGO', 'TOT_JUL',
]

/**
 * Normaliza un encabezado para poder compararlo: mayúsculas, sin espacios, sin
 * acentos. `Guz_Stk `, `GUZ STK` y `GUZ_STK` son la misma columna.
 */
export function normalizarEncabezado(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export interface MapaDeColumnas {
  /** Nombre declarado → índice real en el archivo. */
  indice: Record<string, number>
  /** Las obligatorias que no aparecieron. Si hay una, el archivo no entra. */
  faltan: string[]
  /** Las que el archivo trae y nosotros no declaramos. No es un error. */
  deMas: string[]
}

/**
 * Resuelve el mapa contra la fila de encabezados REAL del archivo.
 *
 * Devuelve lo que falta en vez de tirar una excepción: quien llama decide si
 * eso corta la importación o se muestra en pantalla, y la pantalla tiene que
 * poder decir cuál falta, no «falló».
 */
export function resolverColumnas(encabezados: unknown[]): MapaDeColumnas {
  const porNombre = new Map<string, number>()
  encabezados.forEach((h, i) => {
    const n = normalizarEncabezado(h)
    // Gana la primera: si una columna aparece dos veces, la segunda es la
    // sospechosa, no la primera.
    if (n && !porNombre.has(n)) porNombre.set(n, i)
  })

  const indice: Record<string, number> = {}
  const faltan: string[] = []
  const declaradas = new Set<string>()

  for (const col of [...COLUMNAS_OBLIGATORIAS, ...COLUMNAS_OPCIONALES]) {
    const n = normalizarEncabezado(col)
    declaradas.add(n)
    const i = porNombre.get(n)
    if (i !== undefined) indice[col] = i
    else if (COLUMNAS_OBLIGATORIAS.includes(col)) faltan.push(col)
  }

  const deMas = [...porNombre.keys()].filter((n) => !declaradas.has(n))
  return { indice, faltan, deMas }
}
