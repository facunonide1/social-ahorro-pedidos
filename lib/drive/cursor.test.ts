import assert from 'node:assert/strict'
import { test } from 'node:test'

import { cursorTrasListar, lockLibre, nuevoLock, planDeListado } from './cursor'
import { validarCron } from './cron'
import { planificarCorrida } from './lote'
import { tomarPagina } from './recorrer'

const carpetas = [
  { folder_id: 'priv', folder_nombre: 'compras farmacias (privado)', incluir_subcarpetas: true },
  { folder_id: 'listas', folder_nombre: 'compras farmacias', incluir_subcarpetas: true },
]
const AHORA = '2026-11-13T18:00:00.000Z'

test('la carpeta agregada después de un listado completo trae TODO, no sólo lo nuevo', () => {
  // Así quedó producción: «privado» listada completa; «compras farmacias» nunca.
  const plan = planDeListado({ tareas: [], porCarpeta: { priv: '2026-11-12T16:00:00.000Z' } }, carpetas, AHORA)
  assert.equal(plan.nuevo, true)
  assert.equal(plan.desdePorRaiz.priv, '2026-11-12T16:00:00.000Z')
  assert.equal(plan.desdePorRaiz.listas, null)
  assert.deepEqual(plan.tareas.map((t) => [t.folderId, t.recurse]), [['priv', true], ['listas', true]])
})

test('con el cursor viejo (una sola fecha, ya completo), relista todo una vez', () => {
  const plan = planDeListado({ tareas: [], desde: null }, carpetas, AHORA)
  assert.deepEqual(plan.desdePorRaiz, { priv: null, listas: null })
})

test('el bug, de punta a punta: con la fecha única, los archivos viejos de la carpeta nueva no entraban', async () => {
  const listar = async (id: string) => ({
    files: id === 'listas' ? [{ id: 'lista-norma', name: 'Norma oct.xlsx', mimeType: 'x', modifiedTime: '2026-10-20T00:00:00Z' }] : [],
    nextPageToken: null,
  })
  const tareas = planDeListado({ tareas: [] }, [carpetas[1]], AHORA).tareas
  const viejo = await tomarPagina(tareas, listar, { maxProfundidad: 5, modificadoDespues: '2026-11-12T16:00:00Z', vistos: new Set() })
  assert.equal(viejo.archivos.length, 0)
  const nuevo = await tomarPagina(tareas, listar, { maxProfundidad: 5, modificadoDespues: () => null, vistos: new Set() })
  assert.deepEqual(nuevo.archivos.map((a) => a.fileId), ['lista-norma'])
})

test('un listado en curso sigue con sus fechas; al terminar, cada carpeta queda con el inicio del listado', () => {
  const lock = nuevoLock('c1', new Date(AHORA))
  const enCurso = { tareas: [{ folderId: 'x', pageToken: 'p2', depth: 1, ruta: 'r', raizId: 'listas', raizNombre: 'n', recurse: true }], desdePorRaiz: { priv: '2026-11-01', listas: null }, inicio: '2026-11-13T17:00:00.000Z', lock }
  const plan = planDeListado(enCurso, carpetas, AHORA)
  assert.equal(plan.nuevo, false)
  assert.equal(plan.inicio, '2026-11-13T17:00:00.000Z')
  const parcial = cursorTrasListar(enCurso, { ...plan, tareas: plan.tareas })
  assert.equal(parcial.completo, false)
  assert.deepEqual(parcial.cursor.lock, lock)
  const fin = cursorTrasListar(enCurso, { ...plan, tareas: [] })
  assert.equal(fin.completo, true)
  assert.deepEqual(fin.cursor.porCarpeta, { priv: '2026-11-13T17:00:00.000Z', listas: '2026-11-13T17:00:00.000Z' })
  assert.deepEqual(fin.cursor.lock, lock) // el lock lo suelta quien lo tomó
})

test('el lock vence solo', () => {
  const ahora = new Date(AHORA)
  const l = nuevoLock('c1', ahora)
  assert.equal(lockLibre(l, ahora), false)
  assert.equal(lockLibre(l, new Date(ahora.getTime() + 3 * 60_000)), true)
  assert.equal(lockLibre(null, ahora), true)
})

test('los maestros no bloquean: la planilla y las listas entran antes, y los de 42 MB ni se bajan', () => {
  const cola = [
    { nombre: 'maestro figueiras.xls', clasificacion: 'maestro', bytes: 44_000_000 },
    { nombre: 'maestro guz gon.xls', clasificacion: 'maestro', bytes: 9_000_000 },
    { nombre: 'Compras y precios por droguería', clasificacion: 'planilla', bytes: null },
    { nombre: 'Lista Norma.xlsx', clasificacion: 'precios', bytes: 300_000 },
  ]
  const p = planificarCorrida(cola, { max: 4 })
  assert.deepEqual(p.omitidos.map((a) => a.nombre), ['maestro figueiras.xls'])
  assert.deepEqual(p.elegir.map((a) => a.nombre), ['Compras y precios por droguería', 'Lista Norma.xlsx'])
  assert.deepEqual(p.dejar.map((a) => a.nombre), ['maestro guz gon.xls'])
})

test('el cron: sólo Bearer CRON_SECRET, y distingue «no configurado»', () => {
  const h = (v: string | null) => ({ get: (n: string) => (n === 'authorization' ? v : null) })
  assert.equal(validarCron(h('Bearer s3'), { CRON_SECRET: 's3' }), 'ok')
  assert.equal(validarCron(h('Bearer otro'), { CRON_SECRET: 's3' }), 'secreto_invalido')
  assert.equal(validarCron(h(null), { CRON_SECRET: 's3' }), 'secreto_invalido')
  assert.equal(validarCron(h('Bearer x'), { SYNC_CRON_SECRET: 'x' }), 'sin_cron_secret')
})
