/**
 * Vuelve a cruzar las compras que quedaron sin producto.
 *
 * No borra filas y no pisa un producto que ya estaba. Las que siguen sin
 * match guardan el score: la segunda pasada, con el mismo catálogo, no
 * escribe. Se recorre por id, de a 80, y se corta cerca de los 40 segundos
 * para no comerse el tope de 60 del cron. `siguiente` es el cursor.
 */

import { contextoMatchCompras } from './aplicar'
import { updatesDeRematch, type LineaSinProducto } from './compras-match'

type Adm = any

const PRESUPUESTO_MS = 40_000

export async function rematchearCompras(adm: Adm, opts: {
  cursor?: string | null
  presupuestoMs?: number
} = {}) {
  const presupuesto = opts.presupuestoMs ?? PRESUPUESTO_MS
  const inicio = Date.now()
  const ctx = await contextoMatchCompras(adm)
  let cursor = opts.cursor ?? null
  let revisadas = 0
  let matcheadas = 0
  let sinMatch = 0
  let escritas = 0

  while (Date.now() - inicio < presupuesto) {
    let q = adm.from('compras_lineas')
      .select('id, proveedor_id, producto_nombre, droga, concentracion, unidades, codigo_barras, producto_id, match_score, match_via')
      .is('producto_id', null)
      .order('id', { ascending: true })
      .limit(80)
    if (cursor) q = q.gt('id', cursor)
    const { data, error } = await q
    if (error) throw new Error(error.message)
    const filas = (data ?? []) as LineaSinProducto[]
    if (!filas.length) {
      cursor = null
      break
    }
    const updates = updatesDeRematch(filas, ctx)
    revisadas += filas.length
    const conProducto = updates.filter((u) => u.producto_id).length
    matcheadas += conProducto
    sinMatch += filas.length - conProducto
    for (const u of updates) {
      const { error: eUp } = await adm.from('compras_lineas').update({
        producto_id: u.producto_id,
        match_score: u.match_score,
        match_via: u.match_via,
      }).eq('id', u.id)
      if (eUp) throw new Error(eUp.message)
      escritas++
    }
    cursor = filas.length < 80 ? null : filas[filas.length - 1].id
    if (!cursor) break
  }

  return { revisadas, matcheadas, sinMatch, escritas, siguiente: cursor }
}
