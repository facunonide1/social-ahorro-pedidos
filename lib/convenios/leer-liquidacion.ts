'use client'

import * as XLSX from 'xlsx'

/**
 * E.1 · LEER UN ARCHIVO DE DÉBITOS.
 *
 * ── EL PROBLEMA QUE TIENE ESTO ──────────────────────────────────────────────
 *
 * No sabemos qué formato tiene. Facundo va a traer un archivo de liquidación y
 * de dónde sale y con qué columnas es lo primero que va a haber que ajustar
 * cuando llegue el primero de verdad.
 *
 * Entonces esto no asume un layout: busca columnas por nombre, con los nombres
 * que las obras sociales suelen usar, y **devuelve qué columnas encontró y
 * cuáles no** para que quien sube el archivo vea si acertó antes de guardar
 * nada.
 *
 * Es el mismo patrón que `lib/caja/leer-archivo.ts` (v0.97), y por la misma
 * razón: un importador que asume y falla en silencio deja la mitad de los
 * débitos afuera. Y los débitos que faltan no se notan — es plata que nunca
 * apareció.
 *
 * ── LO QUE PASA SI NO ENCUENTRA EL IMPORTE ──────────────────────────────────
 *
 * El importe queda en null y la fila NO se guarda. Un débito sin importe no
 * sirve para nada y un cero mentiría: diría que la obra social debitó $0.
 */

/** Los nombres con los que puede venir cada campo. */
const COLUMNAS_IMPORTE = [
  'importedebitado', 'debitado', 'debito', 'importe', 'monto', 'total',
  'importedebito', 'montodebitado', 'valor',
]
const COLUMNAS_MOTIVO = [
  'motivo', 'causa', 'observacion', 'observaciones', 'detalle', 'descripcion',
  'motivodebito', 'rechazo', 'motivorechazo', 'glosa', 'leyenda',
]
const COLUMNAS_COMPROBANTE = [
  'comprobante', 'receta', 'nroreceta', 'numeroreceta', 'nrocomprobante',
  'numero', 'nro', 'bono', 'nrobono', 'formulario',
]
const COLUMNAS_FECHA = [
  'fecha', 'fechareceta', 'fechadespacho', 'fechaexpendio', 'fechavta', 'fechaventa',
]
const COLUMNAS_SUCURSAL = [
  'sucursal', 'farmacia', 'boca', 'local', 'punto', 'codigofarmacia', 'codsucursal',
]
/** El código que algunas obras sociales mandan en vez del texto del motivo. */
const COLUMNAS_CODIGO = ['codigo', 'cod', 'codmotivo', 'codigomotivo', 'codrechazo']

export interface FilaLeida {
  /** La fila tal como vino, por si hay que mirarla. */
  cruda: Record<string, string>
  numero_comprobante: string | null
  fecha: string | null
  /** Null cuando no se encontró columna de importe. NO cero. */
  importe: number | null
  motivo_texto: string | null
  sucursal_texto: string | null
  /** Por qué esta fila no se va a guardar. Null = se guarda. */
  se_descarta: string | null
}

export interface LecturaDeLiquidacion {
  nombre: string
  hash: string
  /** Los encabezados tal como vinieron. */
  encabezados: string[]
  /**
   * Qué columna se usó para cada campo. Es lo que mira la persona antes de
   * confirmar: sin esto, confirmar es firmar a ciegas.
   */
  mapeo: Record<string, string | null>
  /** Encabezados que no se usaron para nada. Se muestran: puede faltar algo. */
  sin_usar: string[]
  filas: FilaLeida[]
  /** Cuántas filas se van a guardar y cuántas no. */
  guardables: number
  descartadas: number
  total: number | null
}

function normalizar(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '')
}

function numero(v: unknown): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  let t = String(v).trim()
  if (!t) return null
  const negativo = /^\(.*\)$/.test(t) || t.startsWith('-')
  // Formato argentino: 1.234,56
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')
  t = t.replace(/[^\d.]/g, '')
  const n = Number(t)
  if (!Number.isFinite(n)) return null
  // Un débito es un importe positivo aunque el archivo lo traiga en negativo:
  // lo que importa es cuánto te sacaron, no el signo contable.
  return Math.abs(negativo ? -n : n)
}

function fecha(v: unknown): string | null {
  if (v == null || v === '') return null
  // Serial de Excel.
  if (typeof v === 'number' && v > 20000 && v < 60000) {
    const d = new Date(Date.UTC(1899, 11, 30) as any)
    d.setUTCDate(d.getUTCDate() + v)
    return d.toISOString().slice(0, 10)
  }
  const t = String(v).trim()
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  // dd/mm/yyyy, que es como viene en Argentina.
  m = t.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/)
  if (m) {
    const anio = m[3].length === 2 ? `20${m[3]}` : m[3]
    return `${anio}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  }
  return null
}

function buscarColumna(cols: string[], candidatos: string[]): number {
  const norm = cols.map(normalizar)
  // Exacta primero: «importe» le gana a «importenodebitado».
  for (const c of candidatos) {
    const i = norm.indexOf(c)
    if (i >= 0) return i
  }
  for (let i = 0; i < norm.length; i++) {
    if (candidatos.some((c) => norm[i].includes(c))) return i
  }
  return -1
}

export async function leerLiquidacion(archivo: File): Promise<LecturaDeLiquidacion> {
  const buf = await archivo.arrayBuffer()
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buf)))
    .map((b) => b.toString(16).padStart(2, '0')).join('')

  const libro = XLSX.read(buf, { type: 'array', raw: true, cellDates: false })
  const hoja = libro.Sheets[libro.SheetNames[0]]
  const matriz = XLSX.utils.sheet_to_json<unknown[]>(hoja, {
    header: 1, raw: true, defval: null, blankrows: false,
  })

  // El encabezado puede no ser la primera fila: algunas liquidaciones traen
  // dos o tres líneas de título. Se busca la primera fila que tenga al menos
  // dos encabezados reconocibles.
  let iCabecera = 0
  for (let i = 0; i < Math.min(matriz.length, 12); i++) {
    const cols = (matriz[i] ?? []).map((c) => String(c ?? '').trim())
    const reconocidas = [
      COLUMNAS_IMPORTE, COLUMNAS_MOTIVO, COLUMNAS_COMPROBANTE, COLUMNAS_FECHA,
    ].filter((cand) => buscarColumna(cols, cand) >= 0).length
    if (reconocidas >= 2) { iCabecera = i; break }
  }

  const encabezados = (matriz[iCabecera] ?? []).map((c) => String(c ?? '').trim())
  const idx = {
    importe: buscarColumna(encabezados, COLUMNAS_IMPORTE),
    motivo: buscarColumna(encabezados, COLUMNAS_MOTIVO),
    comprobante: buscarColumna(encabezados, COLUMNAS_COMPROBANTE),
    fecha: buscarColumna(encabezados, COLUMNAS_FECHA),
    sucursal: buscarColumna(encabezados, COLUMNAS_SUCURSAL),
    codigo: buscarColumna(encabezados, COLUMNAS_CODIGO),
  }

  const mapeo: Record<string, string | null> = {
    'Importe debitado': idx.importe >= 0 ? encabezados[idx.importe] : null,
    'Motivo': idx.motivo >= 0 ? encabezados[idx.motivo] : null,
    'N° de comprobante': idx.comprobante >= 0 ? encabezados[idx.comprobante] : null,
    'Fecha': idx.fecha >= 0 ? encabezados[idx.fecha] : null,
    'Sucursal': idx.sucursal >= 0 ? encabezados[idx.sucursal] : null,
    'Código de motivo': idx.codigo >= 0 ? encabezados[idx.codigo] : null,
  }
  const usados = new Set(Object.values(idx).filter((i) => i >= 0))
  const sin_usar = encabezados.filter((h, i) => h !== '' && !usados.has(i))

  const filas: FilaLeida[] = []
  for (let i = iCabecera + 1; i < matriz.length; i++) {
    const fila = matriz[i] ?? []
    if (fila.every((c) => c == null || String(c).trim() === '')) continue

    const cruda: Record<string, string> = {}
    encabezados.forEach((h, j) => { if (h) cruda[h] = String(fila[j] ?? '').trim() })

    const importe = idx.importe >= 0 ? numero(fila[idx.importe]) : null
    // El motivo puede venir como texto, como código, o las dos cosas. Se junta:
    // el matcheador busca términos adentro.
    const motivoTexto = [
      idx.motivo >= 0 ? String(fila[idx.motivo] ?? '').trim() : '',
      idx.codigo >= 0 ? String(fila[idx.codigo] ?? '').trim() : '',
    ].filter(Boolean).join(' ') || null

    let descarta: string | null = null
    if (idx.importe < 0) {
      descarta = 'no se encontró ninguna columna de importe en el archivo'
    } else if (importe == null) {
      descarta = 'el importe de esta fila no se pudo leer'
    } else if (importe === 0) {
      descarta = 'el importe es cero: no es un débito'
    }

    filas.push({
      cruda,
      numero_comprobante: idx.comprobante >= 0 ? String(fila[idx.comprobante] ?? '').trim() || null : null,
      fecha: idx.fecha >= 0 ? fecha(fila[idx.fecha]) : null,
      importe,
      motivo_texto: motivoTexto,
      sucursal_texto: idx.sucursal >= 0 ? String(fila[idx.sucursal] ?? '').trim() || null : null,
      se_descarta: descarta,
    })
  }

  const guardables = filas.filter((f) => !f.se_descarta)
  return {
    nombre: archivo.name, hash, encabezados, mapeo, sin_usar, filas,
    guardables: guardables.length,
    descartadas: filas.length - guardables.length,
    // Null, no cero, cuando no hay columna de importe: un total en cero diría
    // que la obra social no debitó nada.
    total: idx.importe < 0 ? null : guardables.reduce((a, f) => a + (f.importe ?? 0), 0),
  }
}
