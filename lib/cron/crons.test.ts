import assert from 'node:assert/strict'
import { test } from 'node:test'

import { conRegistro, type LineaCorrida } from './corrida'
import { enTandas, upsertEnTandas } from '../supabase/tandas'
import { paginarCompleto } from '../supabase/paginar'

test('conRegistro deja inicio y fin con duración y status', async () => {
  const lineas: LineaCorrida[] = []
  let t = 1000
  const h = conRegistro('prueba', async () => { t += 250; return new Response('ok', { status: 200 }) },
    { escribir: (l) => lineas.push(l), reloj: () => t })
  const r = await h()
  assert.equal(r.status, 200)
  assert.deepEqual(lineas.map((l) => l.evento), ['inicio', 'fin'])
  assert.equal(lineas[1].ms, 250)
  assert.equal(lineas[1].ok, true)
  assert.equal(lineas[0].corrida, lineas[1].corrida)
})

test('conRegistro convierte un throw en 500 y lo registra', async () => {
  const lineas: LineaCorrida[] = []
  const h = conRegistro('prueba', async () => { throw new Error('timeout de la base') },
    { escribir: (l) => lineas.push(l) })
  const r = await h()
  assert.equal(r.status, 500)
  assert.deepEqual(await r.json(), { error: 'timeout de la base' })
  assert.equal(lineas[1].ok, false)
  assert.equal(lineas[1].error, 'timeout de la base')
})

test('conRegistro marca como no ok una respuesta 4xx/5xx sin throw', async () => {
  const lineas: LineaCorrida[] = []
  await conRegistro('prueba', async () => new Response('x', { status: 401 }), { escribir: (l) => lineas.push(l) })()
  assert.equal(lineas[1].ok, false)
  assert.equal(lineas[1].status, 401)
})

test('enTandas rechaza tamaños inválidos', () => {
  assert.throws(() => enTandas([1], 0))
  assert.throws(() => enTandas([1], 1.5))
})

test('upsertEnTandas pasa el onConflict en cada tanda y corta en el error', async () => {
  const llamadas: { n: number; onConflict: string }[] = []
  const adm = { from: () => ({ upsert: async (g: unknown[], o: { onConflict: string }) => {
    llamadas.push({ n: g.length, onConflict: o.onConflict })
    return { error: llamadas.length === 3 ? { message: 'statement timeout' } : null }
  } }) }
  const filas = Array.from({ length: 1200 }, (_, i) => ({ i }))
  await assert.rejects(upsertEnTandas(adm, 'producto_rotacion', filas, 'producto_id,sucursal_id', 500), /llevaba 1000/)
  assert.deepEqual(llamadas.map((l) => l.n), [500, 500, 200])
  assert.ok(llamadas.every((l) => l.onConflict === 'producto_id,sucursal_id'))
})

/** Una consulta falsa que sirve `total` filas por rango. */
function consulta(total: number) {
  return { range: async (desde: number, hasta: number) => {
    const n = Math.max(0, Math.min(hasta, total - 1) - desde + 1)
    return { data: Array.from({ length: n }, (_, i) => desde + i), error: null }
  } }
}

test('paginarCompleto trae todo cuando entra en el tope', async () => {
  assert.equal((await paginarCompleto(consulta(2500), 'x', 10_000)).length, 2500)
})

test('paginarCompleto tira si se llega al tope, no devuelve una parte', async () => {
  await assert.rejects(paginarCompleto(consulta(5000), 'movimientos_stock', 3000), /movimientos_stock: más de/)
})
