/**
 * La cola de la ingesta, en decisiones puras (sin Drive ni base): qué se
 * procesa en esta corrida, en qué orden, qué hacer con lo trabado y cuándo
 * dejar de empezar archivos nuevos. Las prueba lib/drive/cola.test.ts.
 */

import type { Clasificacion } from './clasificar'

export type EnCola = {
  id: string
  clasificacion: Clasificacion | string
  bytes: number | null
  proximo_intento_at: string | null
  created_at?: string | null
}

const ORDEN: Record<string, number> = {
  planilla: 0,
  precios: 1,
  factura: 2,
  sin_clasificar: 3,
  maestro: 9,
}

/**
 * Lo que se procesa en esta corrida. Los maestros (xls de SIFACO de decenas
 * de MB) van al final y de a `maxMaestros`: antes iban primero y una corrida
 * entera se perdía en un archivo que la ingesta ni siquiera aplica.
 */
export function elegirLote<T extends EnCola>(
  cola: T[],
  ahora: Date,
  opts: { maxArchivos: number; maxMaestros: number },
): T[] {
  const listos = cola.filter((a) => !a.proximo_intento_at || Date.parse(a.proximo_intento_at) <= ahora.getTime())
  const ordenados = [...listos].sort((a, b) => {
    const d = (ORDEN[a.clasificacion] ?? 5) - (ORDEN[b.clasificacion] ?? 5)
    if (d) return d
    return String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''))
  })
  const lote: T[] = []
  let maestros = 0
  for (const a of ordenados) {
    if (lote.length >= opts.maxArchivos) break
    if (a.clasificacion === 'maestro') {
      if (maestros >= opts.maxMaestros) continue
      maestros++
    }
    lote.push(a)
  }
  return lote
}

export type Trabado = {
  estado: string
  intentos: number | null
  proximo_intento_at: string | null
  updated_at: string | null
}

/**
 * Un archivo en «procesando»: ¿su lock venció? El lock es `proximo_intento_at`
 * (se pone en ahora + LOCK_MS al tomarlo). Las filas viejas, de antes de esto,
 * no lo tienen: se mira `updated_at`.
 */
export function lockVencido(f: Trabado, ahora: Date, lockMs: number): boolean {
  if (f.estado !== 'procesando') return false
  if (f.proximo_intento_at) return Date.parse(f.proximo_intento_at) <= ahora.getTime()
  if (!f.updated_at) return true
  return Date.parse(f.updated_at) + lockMs <= ahora.getTime()
}

/** Qué pasa con un archivo cuyo lock venció: vuelve a la cola o, gastados los intentos, a error. */
export function liberarTrabado(
  f: Trabado,
  maxIntentos: number,
): { estado: 'pendiente' | 'error'; error: string } {
  const intentos = Number(f.intentos ?? 0)
  if (intentos >= maxIntentos) {
    return {
      estado: 'error',
      error: `Se cortó a mitad de camino ${intentos} veces (archivo grande o la función se quedó sin tiempo). Revisalo a mano.`,
    }
  }
  return { estado: 'pendiente', error: 'Se cortó a mitad de camino: se reintenta.' }
}

/** ¿Queda tiempo para empezar otro archivo? */
export function quedaTiempo(inicioMs: number, ahoraMs: number, presupuestoMs: number): boolean {
  return ahoraMs - inicioMs < presupuestoMs
}

/**
 * Un maestro que pesa más que el tope no se baja: se avisa y se marca para
 * subir a mano. Bajarlo (42 MB) para descubrir después que no se estaciona
 * gastaba la corrida entera. La ingesta NUNCA aplica un maestro.
 */
export function maestroSinBajar(bytes: number | null, tope: number): boolean {
  return bytes != null && bytes > tope
}

/** Tramo de grupos de la planilla para esta corrida, y si con eso termina. */
export function tramoDePlanilla(total: number, desde: number, porCorrida: number): { desde: number; hasta: number; termina: boolean } {
  const d = Math.max(0, Math.min(desde, total))
  const h = Math.min(total, d + Math.max(1, porCorrida))
  return { desde: d, hasta: h, termina: h >= total }
}
