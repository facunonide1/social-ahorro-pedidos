'use client'

import * as XLSX from 'xlsx'

import { detectarCodificacion, type Veredicto } from './codificacion'
import { FILA_PRIMER_DATO, codigoSifaco, esFilaDeEncabezado } from './columnas'
import { normalizarFila, type Fila } from './fila'

/**
 * EL PARSEO PASA EN EL NAVEGADOR, Y NO ES UN ATAJO.
 *
 * pla_3d_24 pesa 41 MB y trae 46.035 filas × 68 columnas. Meter eso en una
 * función serverless choca con dos límites distintos: el cuerpo de la request
 * (~4,5 MB) y el pico de memoria del parseo, justo donde no hay forma de verlo
 * cuando falla.
 *
 * Acá el archivo se lee una sola vez en la máquina de quien lo sube —que ya lo
 * tiene—, se arregla la codificación, se convierten las fechas y los números, y
 * al servidor le llegan tandas de 500 filas ya limpias. El original va derecho
 * a Storage por una URL firmada, sin pasar por ninguna función.
 *
 * ── EL ORDEN IMPORTA ────────────────────────────────────────────────────────
 *
 * Primero se detecta la codificación sobre una muestra grande de descripciones,
 * DESPUÉS se convierte todo. Detectarla por fila daría un ganador distinto en
 * cada fila corta y el catálogo quedaría con la mitad arreglada.
 */

export const FILAS_POR_LOTE = 500
/** Con 3.000 descripciones ya aparecen las cinco palabras testigo. */
const MUESTRA_CODIFICACION = 3000

export interface ArchivoLeido {
  filas: unknown[][]
  veredicto: Veredicto
  /** Filas de datos: sin el encabezado ni el renglón de reporte de SIFACO. */
  filasDeDatos: number
}

/** Lee el .xls y decide la codificación. No convierte nada todavía. */
export async function leerMaestro(archivo: File): Promise<ArchivoLeido> {
  const buf = await archivo.arrayBuffer()
  const libro = XLSX.read(buf, { type: 'array', cellDates: false, raw: true })
  const hoja = libro.Sheets[libro.SheetNames[0]]
  const filas = XLSX.utils.sheet_to_json<unknown[]>(hoja, {
    header: 1, raw: true, defval: null, blankrows: false,
  })

  const muestra: string[] = []
  for (let i = FILA_PRIMER_DATO; i < filas.length && muestra.length < MUESTRA_CODIFICACION; i++) {
    const d = filas[i]?.[0]
    if (typeof d === 'string' && d) muestra.push(d)
  }

  let filasDeDatos = 0
  for (let i = FILA_PRIMER_DATO; i < filas.length; i++) {
    const f = filas[i]
    if (!f) continue
    const cod = codigoSifaco(f[24])
    const des = typeof f[0] === 'string' ? f[0] : null
    if (!cod || esFilaDeEncabezado(cod, des)) continue
    filasDeDatos++
  }

  return { filas, veredicto: detectarCodificacion(muestra), filasDeDatos }
}

/** SHA-256 del archivo, en el navegador, antes de subir nada. */
export async function hashDeArchivo(archivo: File): Promise<string> {
  const buf = await archivo.arrayBuffer()
  const d = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export interface Progreso {
  lote: number
  lotes: number
  filas: number
  filasTotales: number
}

/**
 * Manda el archivo al servidor en tandas, salteando los lotes que ya entraron.
 *
 * `lotesHechos` sale de preguntarle al servidor: si la carga se cortó en el
 * lote 87 de 93, se retoman seis y no noventa y tres.
 */
export async function* subirEnLotes(
  importacionId: string,
  leido: ArchivoLeido,
  lotesHechos: Set<number>,
): AsyncGenerator<Progreso> {
  const cod = leido.veredicto.codificacion
  const normalizadas: Fila[] = []

  for (let i = FILA_PRIMER_DATO; i < leido.filas.length; i++) {
    const f = leido.filas[i]
    if (!f) continue
    const n = normalizarFila(f, i, cod)
    if (n) normalizadas.push(n)
  }

  const lotes = Math.ceil(normalizadas.length / FILAS_POR_LOTE)

  for (let l = 0; l < lotes; l++) {
    if (lotesHechos.has(l)) {
      yield { lote: l + 1, lotes, filas: Math.min((l + 1) * FILAS_POR_LOTE, normalizadas.length), filasTotales: normalizadas.length }
      continue
    }
    const desde = l * FILAS_POR_LOTE
    const tanda = normalizadas.slice(desde, desde + FILAS_POR_LOTE)

    const r = await fetch(`/api/sifaco/importar/${importacionId}/lote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lote: l,
        desde_fila: tanda[0]?.fila ?? desde,
        filas: tanda,
        filas_declaradas: normalizadas.length,
        codificacion: cod,
        codificacion_prueba: leido.veredicto,
      }),
    })
    if (!r.ok) {
      const j = await r.json().catch(() => ({}))
      throw new Error(`Lote ${l + 1} de ${lotes}: ${j?.error ?? r.statusText}`)
    }

    yield { lote: l + 1, lotes, filas: desde + tanda.length, filasTotales: normalizadas.length }
  }
}
