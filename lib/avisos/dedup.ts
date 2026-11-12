/**
 * DEDUP DE AVISOS SIN URLs GIGANTES.
 *
 * PostgREST manda los filtros en la URL. Un `.in('clave_dedup', claves)` con
 * cientos de claves de 40-80 caracteres arma un pedido de decenas de KB y el
 * gateway lo corta con 400 «header too large». Antes, además, el error no se
 * leía: `previos` venía null, todo contaba como nuevo y los avisos se
 * duplicaban cada día.
 *
 * Acá las claves van en tandas chicas, y cualquier error corta la corrida en
 * vez de publicar de más.
 */

import { enTandas, insertarEnTandas as insertarGenerico } from '@/lib/supabase/tandas'

export { enTandas }

type Adm = { from: (t: string) => any }

/** Claves por consulta. 50 × ~80 caracteres codificados queda lejos de 8 KB. */
export const TANDA_CLAVES = 50
/** Filas por insert. */
export const TANDA_INSERT = 200
/** Las claves que ya tienen un aviso pendiente en `nora_avisos`. */
export async function clavesYaPendientes(
  adm: Adm,
  claves: readonly string[],
  tanda: number = TANDA_CLAVES,
): Promise<Set<string>> {
  const unicas = Array.from(new Set(claves.filter(Boolean)))
  const ya = new Set<string>()
  for (const grupo of enTandas(unicas, tanda)) {
    const { data, error } = await adm.from('nora_avisos')
      .select('clave_dedup').in('clave_dedup', grupo).eq('estado', 'pendiente')
    if (error) throw new Error(`no se pudo revisar los avisos previos: ${error.message ?? error}`)
    for (const f of (data ?? []) as { clave_dedup: string }[]) ya.add(f.clave_dedup)
  }
  return ya
}

/**
 * Se queda con los hallazgos cuya clave no está pendiente ni repetida en el
 * mismo lote (dos hallazgos con la misma clave serían el mismo aviso).
 */
export function soloNuevos<H extends { clave: string }>(hallazgos: readonly H[], yaEstan: Set<string>): H[] {
  const vistos = new Set<string>()
  return hallazgos.filter((h) => {
    if (!h.clave || yaEstan.has(h.clave) || vistos.has(h.clave)) return false
    vistos.add(h.clave)
    return true
  })
}

/** Inserta avisos en tandas de 200. Corta en el primer error. */
export function insertarEnTandas(
  adm: Adm,
  tabla: string,
  filas: readonly Record<string, unknown>[],
  tanda: number = TANDA_INSERT,
): Promise<number> {
  return insertarGenerico(adm, tabla, filas, tanda)
}
