/**
 * DE QUÉ MES ES CADA COLUMNA DE VENTAS DEL MAESTRO.
 *
 * Las columnas no se mueven: la 1 es el mes en curso (`este`) y las 2..13 son
 * los doce meses cerrados, del más nuevo al más viejo. Lo que sí se mueve es
 * el NOMBRE. `MESES_MAESTRO` describe el export de agosto de 2026
 * (jul26..ago25). El de Guzmán del 09/11/2026 trae oct26..nov25 en los mismos
 * índices. Cargar ese archivo con los nombres de agosto etiqueta tres meses
 * atrás.
 *
 * El nombre se lee del archivo, en este orden:
 *
 *   1. El encabezado, si las columnas 2..13 dicen oct26, sep26, … (o 10/26).
 *      Son ASCII: la codificación rota no las toca, que es por qué el resto
 *      del mapa sigue yendo por índice.
 *   2. Si el encabezado no se puede leer, la fecha del reporte
 *      («*** 09/11/26 ***»). `este` es ese mes, parcial, y los doce cerrados
 *      son los anteriores.
 *   3. Si no hay ninguna de las dos, `MESES_MAESTRO`. Es el único caso en que
 *      se usan los nombres de agosto, y la pantalla lo dice.
 *
 * No se usa la leyenda «Mes En Curso: 10/26». En el archivo del 09/11/2026
 * esa línea dice octubre y las columnas, la fecha del reporte y el volumen
 * de `este` (un mes a medio cargar) dicen noviembre. Etiquetar con la leyenda
 * correría todo un mes.
 */

import { MESES_MAESTRO } from './columnas'

/** Columna del mes en curso. Parcial: el export cae adentro del mes. */
export const INDICE_MES_EN_CURSO = 1
/** Primera columna de mes cerrado. La más nueva. */
export const INDICE_PRIMER_MES_CERRADO = 2
export const CANTIDAD_MESES_CERRADOS = 12

/**
 * ago25 en el export de agosto venía cortado (3.509 unidades contra ~28.000).
 * Es un hecho de ESE archivo, no una regla de «el más viejo siempre está
 * cortado»: en el export de noviembre el más viejo es nov25, que en agosto
 * era un mes entero. Se marca parcial sólo cuando el más viejo es ese corte.
 */
const CORTE_DE_LA_SERIE = '2025-08'

const NOMBRES_MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'] as const

const MES_POR_NOMBRE: Record<string, number> = {
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6,
  jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12,
}

/** Cuántas filas de título se miran antes de los productos. */
const FILAS_DE_TITULO = 8

export interface MesVenta {
  /** `oct26`. El nombre corto, para mostrar. */
  campo: string
  /** `2026-10`. Lo que se guarda como período. */
  periodo: string
  parcial: boolean
}

export interface MesesDelMaestro {
  /** Columna 1. */
  este: MesVenta
  /** Columnas 2..13, del más nuevo al más viejo. Siempre doce. */
  cerrados: MesVenta[]
  origen: 'encabezado' | 'fecha' | 'constante'
  /**
   * Falso sólo cuando el encabezado y la fecha del reporte nombran meses
   * distintos. Se usan los del encabezado: son el nombre de la columna.
   */
  coherente: boolean
  /** Día del reporte, `AAAA-MM-DD`, si el archivo lo trae. */
  fechaArchivo: string | null
}

export function campoDePeriodo(periodo: string): string {
  const mes = Number(periodo.slice(5, 7))
  const anio = periodo.slice(2, 4)
  return `${NOMBRES_MES[mes - 1]}${anio}`
}

function anioCorto(n: number): number | null {
  if (n < 100) n += n < 70 ? 2000 : 1900
  if (n < 1990 || n > 2100) return null
  return n
}

function periodoDe(anio: number, mes: number): string | null {
  if (mes < 1 || mes > 12) return null
  const a = anioCorto(anio)
  if (a === null) return null
  return `${a}-${String(mes).padStart(2, '0')}`
}

function desplazarMes(periodo: string, delta: number): string {
  const anio = Number(periodo.slice(0, 4))
  const mes = Number(periodo.slice(5, 7))
  const d = new Date(Date.UTC(anio, mes - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function textoCelda(valor: unknown): string {
  return String(valor ?? '').replace(/^\uFEFF/, '').trim()
}

/**
 * `oct26`, `OCT-26`, `set26`, `10/26`, `10/2026`. Nada con tres partes
 * (`09/11/26` es una fecha, no un mes) y nada que no sea la celda entera.
 */
export function parsearEtiquetaMes(valor: unknown): { campo: string; periodo: string } | null {
  let t = textoCelda(valor).toLowerCase()
  if (!t) return null
  t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  t = t.replace(/^(?:vta|vtas|ventas|mes)[\s_-]*/, '')

  const porNombre = t.match(/^(ene|feb|mar|abr|may|jun|jul|ago|sep|set|oct|nov|dic)[\s_./-]*(\d{2}|\d{4})$/)
  const porNumero = t.match(/^(\d{1,2})[\s_./-](\d{2}|\d{4})$/)
  const mes = porNombre ? MES_POR_NOMBRE[porNombre[1]] : porNumero ? Number(porNumero[1]) : null
  const anio = porNombre ? Number(porNombre[2]) : porNumero ? Number(porNumero[2]) : null
  if (mes === null || anio === null) return null

  const periodo = periodoDe(anio, mes)
  if (!periodo) return null
  return { campo: campoDePeriodo(periodo), periodo }
}

function fechaDePartes(dia: number, mes: number, anio: number): string | null {
  const a = anioCorto(anio)
  if (a === null || mes < 1 || mes > 12 || dia < 1 || dia > 31) return null
  return `${a}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

/** «*** 09/11/26 ***» o con hora, en las primeras filas. Día/mes/año. */
export function fechaDeReporte(filas: unknown[][]): string | null {
  const re = /\*{2,}\s*(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?\s*\*{2,}/
  const limite = Math.min(filas.length, FILAS_DE_TITULO)
  for (let i = 0; i < limite; i++) {
    const fila = filas[i]
    if (!Array.isArray(fila)) continue
    for (const celda of fila) {
      if (typeof celda !== 'string') continue
      const m = celda.match(re)
      if (!m) continue
      const iso = fechaDePartes(Number(m[1]), Number(m[2]), Number(m[3]))
      if (iso) return iso
    }
  }
  return null
}

function serieHaciaAtras(periodos: string[]): boolean {
  if (periodos.length !== CANTIDAD_MESES_CERRADOS) return false
  for (let i = 1; i < periodos.length; i++) {
    if (desplazarMes(periodos[i - 1], -1) !== periodos[i]) return false
  }
  return true
}

function cerradosDesde(masNuevo: string): MesVenta[] {
  const out: MesVenta[] = []
  let periodo = masNuevo
  for (let i = 0; i < CANTIDAD_MESES_CERRADOS; i++) {
    out.push({ campo: campoDePeriodo(periodo), periodo, parcial: false })
    periodo = desplazarMes(periodo, -1)
  }
  const ultimo = out.length - 1
  if (out[ultimo].periodo === CORTE_DE_LA_SERIE) {
    out[ultimo] = { ...out[ultimo], parcial: true }
  }
  return out
}

function esteDe(periodo: string): MesVenta {
  return { campo: campoDePeriodo(periodo), periodo, parcial: true }
}

/**
 * La fila cuyo bloque 2..13 es doce meses seguidos hacia atrás.
 * No asume que sea la fila 0: en unos exports el título va primero.
 */
function cerradosDelEncabezado(filas: unknown[][]): MesVenta[] | null {
  const limite = Math.min(filas.length, FILAS_DE_TITULO)
  for (let i = 0; i < limite; i++) {
    const fila = filas[i]
    if (!Array.isArray(fila)) continue
    const periodos: string[] = []
    for (let k = 0; k < CANTIDAD_MESES_CERRADOS; k++) {
      const p = parsearEtiquetaMes(fila[INDICE_PRIMER_MES_CERRADO + k])
      if (!p) { periodos.length = 0; break }
      periodos.push(p.periodo)
    }
    if (serieHaciaAtras(periodos)) return cerradosDesde(periodos[0])
  }
  return null
}

function fallbackAgosto(fechaArchivo: string | null): MesesDelMaestro {
  const cerrados = MESES_MAESTRO.map((m) => ({
    campo: m.campo,
    periodo: m.periodo,
    parcial: m.parcial,
  }))
  return {
    este: esteDe(desplazarMes(cerrados[0].periodo, 1)),
    cerrados,
    origen: 'constante',
    coherente: true,
    fechaArchivo,
  }
}

/**
 * Los meses de este archivo. No mira la leyenda «Mes En Curso»: mira las
 * columnas 2..13 y, si no dicen un mes, la fecha entre asteriscos.
 */
export function resolverMesesMaestro(filas: unknown[][]): MesesDelMaestro {
  const fechaArchivo = fechaDeReporte(filas)
  const porEncabezado = cerradosDelEncabezado(filas)

  if (porEncabezado) {
    const este = esteDe(desplazarMes(porEncabezado[0].periodo, 1))
    const coherente = !fechaArchivo || fechaArchivo.slice(0, 7) === este.periodo
    return { este, cerrados: porEncabezado, origen: 'encabezado', coherente, fechaArchivo }
  }

  if (fechaArchivo) {
    const periodoEste = fechaArchivo.slice(0, 7)
    return {
      este: esteDe(periodoEste),
      cerrados: cerradosDesde(desplazarMes(periodoEste, -1)),
      origen: 'fecha',
      coherente: true,
      fechaArchivo,
    }
  }

  return fallbackAgosto(null)
}

export function esMesesDelMaestro(v: unknown): v is MesesDelMaestro {
  if (!v || typeof v !== 'object') return false
  const m = v as Partial<MesesDelMaestro>
  if (!esMes(m.este)) return false
  if (!Array.isArray(m.cerrados) || m.cerrados.length !== CANTIDAD_MESES_CERRADOS) return false
  if (!m.cerrados.every(esMes)) return false
  if (m.origen !== 'encabezado' && m.origen !== 'fecha' && m.origen !== 'constante') return false
  if (typeof m.coherente !== 'boolean') return false
  if (m.fechaArchivo !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(m.fechaArchivo ?? ''))) return false
  return true
}

function esMes(v: unknown): v is MesVenta {
  if (!v || typeof v !== 'object') return false
  const m = v as Partial<MesVenta>
  return typeof m.campo === 'string'
    && typeof m.periodo === 'string'
    && /^\d{4}-\d{2}$/.test(m.periodo)
    && typeof m.parcial === 'boolean'
}

/** La frase que muestra la pantalla antes de subir. */
export function fraseMeses(m: MesesDelMaestro): string {
  const desde = m.cerrados[0]?.campo ?? '?'
  const hasta = m.cerrados[m.cerrados.length - 1]?.campo ?? '?'
  const base = `Ventas: ${m.este.campo} es el mes en curso (parcial) y los doce cerrados van de ${desde} a ${hasta}.`
  if (m.origen === 'constante') {
    return `${base} El archivo no trae los nombres de los meses ni la fecha del reporte, así que estas etiquetas son las del maestro de agosto de 2026.`
  }
  if (!m.coherente) {
    return `${base} La fecha del reporte cae en otro mes: se usaron los nombres de las columnas.`
  }
  return base
}
