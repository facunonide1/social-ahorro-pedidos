'use client'

import * as XLSX from 'xlsx'

/**
 * LEER UN ARCHIVO DE TICKETS O DE VENTAS.
 *
 * ── EL PROBLEMA QUE TIENE ESTO ──────────────────────────────────────────────
 *
 * No sabemos qué formato tienen. Facundo dijo que manda «archivo de tickets y
 * ventas»; de dónde salen y con qué columnas es lo primero que va a haber que
 * ajustar cuando llegue el primero de verdad.
 *
 * Entonces esto no asume un layout: busca columnas por nombre, con los nombres
 * que SIFACO y los sistemas de caja suelen usar, y **devuelve qué columnas
 * encontró** para que quien sube el archivo vea si acertó. Si no encuentra la
 * columna de importe, el total queda en null —no en cero— y la pantalla lo dice.
 *
 * Un total en cero haría que el cruce muestre una diferencia igual a todo lo
 * declarado, y eso se lee como un robo.
 */

/** Los nombres con los que puede venir el importe de cada renglón. */
const COLUMNAS_IMPORTE = [
  'importe', 'total', 'monto', 'importetotal', 'totalticket', 'subtotal', 'neto',
]
const COLUMNAS_EFECTIVO = ['efectivo', 'contado', 'cash']
const COLUMNAS_TARJETA = ['tarjeta', 'tarjetas', 'debito', 'credito', 'posnet']
const COLUMNAS_OTROS = ['mercadopago', 'mp', 'qr', 'transferencia', 'otros', 'cuentadni']
/** Y las que indican que el renglón NO cuenta. */
const COLUMNAS_ANULADO = ['anulado', 'anulada', 'estado', 'cancelado']

export interface LecturaDeCaja {
  nombre: string
  hash: string
  filas: number
  /** Null cuando no se encontró columna de importe. NO cero. */
  total: number | null
  efectivo: number | null
  tarjetas: number | null
  otros: number | null
  /** Los encabezados tal como vinieron: para que quien sube vea qué se leyó. */
  columnas: string[]
  /** Cuántos renglones se saltaron por estar anulados. */
  anulados: number
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
  // Formato argentino: 1.234,56
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')
  t = t.replace(/[^\d.\-]/g, '')
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

function buscarColumna(cols: string[], candidatos: string[]): number {
  const norm = cols.map(normalizar)
  // Exacta primero: «total» le gana a «totalticketanulado».
  for (const c of candidatos) {
    const i = norm.indexOf(c)
    if (i >= 0) return i
  }
  for (let i = 0; i < norm.length; i++) {
    if (candidatos.some((c) => norm[i].includes(c))) return i
  }
  return -1
}

export async function leerArchivoDeCaja(archivo: File): Promise<LecturaDeCaja> {
  const buf = await archivo.arrayBuffer()
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buf)))
    .map((b) => b.toString(16).padStart(2, '0')).join('')

  const libro = XLSX.read(buf, { type: 'array', raw: true, cellDates: false })
  const hoja = libro.Sheets[libro.SheetNames[0]]
  const filas = XLSX.utils.sheet_to_json<unknown[]>(hoja, {
    header: 1, raw: true, defval: null, blankrows: false,
  })

  const cols = (filas[0] ?? []).map((c) => String(c ?? '').trim())
  const iImporte = buscarColumna(cols, COLUMNAS_IMPORTE)
  const iEfectivo = buscarColumna(cols, COLUMNAS_EFECTIVO)
  const iTarjeta = buscarColumna(cols, COLUMNAS_TARJETA)
  const iOtros = buscarColumna(cols, COLUMNAS_OTROS)
  const iAnulado = buscarColumna(cols, COLUMNAS_ANULADO)

  let total = 0; let efectivo = 0; let tarjetas = 0; let otros = 0
  let n = 0; let anulados = 0

  for (let f = 1; f < filas.length; f++) {
    const fila = filas[f]
    if (!fila) continue

    // Un ticket anulado en el archivo no es plata que entró. Si la columna de
    // estado dice algo que empieza con «anul», el renglón no cuenta.
    if (iAnulado >= 0) {
      const e = normalizar(fila[iAnulado])
      if (e.startsWith('anul') || e.startsWith('cancel')) { anulados++; continue }
    }

    const imp = iImporte >= 0 ? numero(fila[iImporte]) : null
    if (imp === null && iEfectivo < 0 && iTarjeta < 0) continue

    n++
    if (imp !== null) total += imp
    if (iEfectivo >= 0) efectivo += numero(fila[iEfectivo]) ?? 0
    if (iTarjeta >= 0) tarjetas += numero(fila[iTarjeta]) ?? 0
    if (iOtros >= 0) otros += numero(fila[iOtros]) ?? 0
  }

  const redondear = (x: number) => Math.round(x * 100) / 100

  return {
    nombre: archivo.name,
    hash,
    filas: n,
    // Null si no había columna de importe: lo que no se puede saber no es cero.
    total: iImporte >= 0 ? redondear(total) : (iEfectivo >= 0 || iTarjeta >= 0
      ? redondear(efectivo + tarjetas + otros) : null),
    efectivo: iEfectivo >= 0 ? redondear(efectivo) : null,
    tarjetas: iTarjeta >= 0 ? redondear(tarjetas) : null,
    otros: iOtros >= 0 ? redondear(otros) : null,
    columnas: cols.filter(Boolean),
    anulados,
  }
}
