'use client'

import * as XLSX from 'xlsx'

import { resolverColumnas, type MapaDeColumnas } from './columnas-sucursales'
import {
  normalizarArchivoSucursales, type FilaSucursal, type ResumenDelArchivo,
} from './fila-sucursal'
import { verificarMaestro, veredicto, type Chequeo } from './verificacion'

/**
 * EL MAESTRO POR SUCURSAL, LEÍDO EN EL NAVEGADOR.
 *
 * Mismo motivo que `parseo-cliente.ts` para el maestro anterior: el archivo
 * pesa 35 MB y 48.127 filas × 59 columnas no entran en una función serverless
 * —ni por el cuerpo de la request ni por el pico de memoria del parseo—. Se lee
 * una sola vez en la máquina de quien lo sube, que ya lo tiene, y al servidor
 * le llegan tandas de 500 filas ya limpias.
 *
 * ── LO QUE CAMBIA RESPECTO DEL OTRO ─────────────────────────────────────────
 *
 * No hay detección de codificación. Este layout no la necesita: sus encabezados
 * son códigos ASCII y en las 48.127 filas del archivo del 14-10 hay CERO
 * descripciones con mojibake. Se verifica igual y se reporta —`conMojibake` en
 * el resumen—, porque suponerlo sería la mitad del trabajo.
 */

export const FILAS_POR_LOTE = 500

export interface ArchivoSucursalesLeido {
  hoja: string
  mapa: MapaDeColumnas
  filas: FilaSucursal[]
  resumen: ResumenDelArchivo
  chequeos: Chequeo[]
  entra: boolean
  cortes: number
  avisos: number
}

export interface ImportacionAnterior {
  filas: number
  valorCosto: number | null
  fechaArchivo: string | null
}

/**
 * Lee el archivo y lo verifica, sin mandar nada todavía.
 *
 * Verificar ANTES de subir no es una optimización: es la única forma de que
 * «este archivo no entra» se pueda decir sin haber escrito una fila.
 */
export async function leerMaestroSucursales(
  archivo: File, anterior: ImportacionAnterior | null,
): Promise<ArchivoSucursalesLeido> {
  const buf = await archivo.arrayBuffer()
  const libro = XLSX.read(buf, { type: 'array', cellDates: false, raw: true })
  const nombreHoja = libro.SheetNames[0]
  const hoja = libro.Sheets[nombreHoja]
  const filas = XLSX.utils.sheet_to_json<unknown[]>(hoja, {
    header: 1, raw: true, defval: null, blankrows: false,
  })

  const mapa = resolverColumnas(filas[0] ?? [])

  // Si faltan columnas obligatorias no se normaliza nada: con el stock de una
  // sucursal ausente, cada fila diría cero para ese local y cero quiere decir
  // «lo miré y no hay». No se puede ni mostrar una vista previa de eso.
  if (mapa.faltan.length) {
    const chequeos = verificarMaestro({
      encabezados: filas[0] ?? [], filas: 0, fechaArchivo: null,
      gruposNomGru: [], valorCosto: null, duplicados: [], anterior,
    })
    const v = veredicto(chequeos)
    return { hoja: nombreHoja, mapa, filas: [], resumen: {
      filas: 0, fechaArchivo: null, gruposNomGru: [], valorCosto: 0,
      duplicados: [], conMojibake: 0,
    }, chequeos, ...v }
  }

  const { filas: normalizadas, resumen } = normalizarArchivoSucursales(filas, mapa)

  const chequeos = verificarMaestro({
    encabezados: filas[0] ?? [],
    filas: resumen.filas,
    fechaArchivo: resumen.fechaArchivo,
    gruposNomGru: resumen.gruposNomGru,
    valorCosto: resumen.valorCosto,
    duplicados: resumen.duplicados,
    anterior,
  })
  const v = veredicto(chequeos)

  return { hoja: nombreHoja, mapa, filas: normalizadas, resumen, chequeos, ...v }
}

/** SHA-256 del archivo, en el navegador, antes de subir nada. */
export async function hashDeArchivo(archivo: File): Promise<string> {
  const buf = await archivo.arrayBuffer()
  const d = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export interface Progreso { lote: number; lotes: number; filas: number; filasTotales: number }

/** Manda la pila en tandas, salteando los lotes que ya entraron. */
export async function* subirSucursalesEnLotes(
  importacionId: string, leido: ArchivoSucursalesLeido, lotesHechos: Set<number>,
): AsyncGenerator<Progreso> {
  const total = leido.filas.length
  const lotes = Math.ceil(total / FILAS_POR_LOTE)

  for (let l = 0; l < lotes; l++) {
    const desde = l * FILAS_POR_LOTE
    if (lotesHechos.has(l)) {
      yield { lote: l + 1, lotes, filas: Math.min(desde + FILAS_POR_LOTE, total), filasTotales: total }
      continue
    }
    const tanda = leido.filas.slice(desde, desde + FILAS_POR_LOTE)

    const r = await fetch(`/api/sifaco/importar/${importacionId}/lote-sucursal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lote: l,
        filas: tanda,
        filas_declaradas: total,
        fecha_archivo: leido.resumen.fechaArchivo,
        verificacion: leido.chequeos,
        resumen: {
          valor_costo: Math.round(leido.resumen.valorCosto),
          duplicados: leido.resumen.duplicados,
          fecha_del_dato: leido.resumen.fechaArchivo,
          hoja: leido.hoja,
          columnas_sin_usar: leido.mapa.deMas,
          con_mojibake: leido.resumen.conMojibake,
        },
      }),
    })
    if (!r.ok) {
      const j = await r.json().catch(() => ({}))
      throw new Error(`Lote ${l + 1} de ${lotes}: ${j?.error ?? r.statusText}`)
    }

    yield { lote: l + 1, lotes, filas: desde + tanda.length, filasTotales: total }
  }
}
