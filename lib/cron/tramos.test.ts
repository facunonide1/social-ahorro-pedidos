import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'

import {
  canonico, diferenciaAlertas, enRango, paginarConPlazo, Plazo, PlazoVencido, rangoDeTramo, tramoDeLaCorrida,
} from './tramos'

test('los tramos cubren todo el espacio de UUID sin pisarse', () => {
  for (const n of [1, 2, 6, 7, 16]) {
    const rs = Array.from({ length: n }, (_, i) => rangoDeTramo(i, n))
    assert.equal(rs[0].desde, '00000000-0000-0000-0000-000000000000')
    assert.equal(rs[n - 1].hasta, null)
    for (let i = 1; i < n; i++) assert.equal(rs[i].desde, rs[i - 1].hasta)
  }
})

test('cada UUID cae en exactamente un tramo, y los tramos salen parejos', () => {
  const n = 6
  const rs = Array.from({ length: n }, (_, i) => rangoDeTramo(i, n))
  const cuenta = new Array(n).fill(0)
  for (let k = 0; k < 6000; k++) {
    const u = randomUUID()
    const donde = rs.map((r, i) => (enRango(u, r) ? i : -1)).filter((i) => i >= 0)
    assert.equal(donde.length, 1, u)
    cuenta[donde[0]]++
  }
  // ~1000 por tramo; con 6000 muestras, ninguno debería quedar fuera de 800..1200.
  assert.ok(cuenta.every((c) => c > 800 && c < 1200), cuenta.join(','))
  assert.ok(enRango('FFFFFFFF-FFFF-4FFF-BFFF-FFFFFFFFFFFF', rs[n - 1]))
})

test('rangoDeTramo rechaza tramos fuera de rango', () => {
  assert.throws(() => rangoDeTramo(6, 6))
  assert.throws(() => rangoDeTramo(-1, 6))
  assert.throws(() => rangoDeTramo(0, 0))
})

test('el tramo sale del reloj, y en la ventana de una hora cada uno corre dos veces', () => {
  const veces = new Array(6).fill(0)
  for (let m = 0; m < 60; m += 5) {
    veces[tramoDeLaCorrida(null, new Date(Date.UTC(2026, 10, 12, 4, m)), 6)]++
  }
  assert.deepEqual(veces, [2, 2, 2, 2, 2, 2])
})

test('?tramo= manda sobre el reloj y se valida', () => {
  const ahora = new Date(Date.UTC(2026, 10, 12, 4, 25))
  assert.equal(tramoDeLaCorrida(new URL('https://x/api?tramo=3'), ahora, 6), 3)
  assert.throws(() => tramoDeLaCorrida(new URL('https://x/api?tramo=9'), ahora, 6))
  assert.throws(() => tramoDeLaCorrida(new URL('https://x/api?tramo=a'), ahora, 6))
})

test('paginarConPlazo corta con PlazoVencido antes de pedir otra página', async () => {
  let t = 0
  const plazo = new Plazo(() => t)
  let pedidas = 0
  const consulta = { range: async (d: number) => { pedidas++; t += 15_000; return { data: Array.from({ length: 1000 }, (_, i) => d + i), error: null } } }
  await assert.rejects(paginarConPlazo(consulta, 'stock_items', plazo, 40_000), (e) => e instanceof PlazoVencido)
  assert.equal(pedidas, 3) // 0s, 15s, 30s piden; a los 45s ya no
})

test('paginarConPlazo trae todo si entra en el plazo', async () => {
  const plazo = new Plazo(() => 0)
  const consulta = { range: async (d: number) => ({ data: Array.from({ length: d < 2000 ? 1000 : 10 }, (_, i) => d + i), error: null }) }
  assert.equal((await paginarConPlazo(consulta, 'x', plazo)).length, 2010)
})

test('canonico no depende del orden de las claves', () => {
  assert.equal(canonico({ b: 1, a: { d: [1, { y: 2, x: 1 }], c: null } }), canonico({ a: { c: null, d: [1, { x: 1, y: 2 }] }, b: 1 }))
  assert.notEqual(canonico({ a: 1 }), canonico({ a: 2 }))
})

const al = (tipo: string, p: string, s: string, sev = 'warning', datos: any = { stock: 1 }, lote: string | null = null) =>
  ({ tipo, producto_id: p, sucursal_id: s, lote_id: lote, severidad: sev, datos })

test('diferenciaAlertas: lo que no cambió no se toca', () => {
  const ex = [{ id: 'e1', ...al('stock_critico', 'p1', 's1', 'warning', { stock: 1, min: 3 }) }]
  const d = diferenciaAlertas(ex, [al('stock_critico', 'p1', 's1', 'warning', { min: 3, stock: 1 })])
  assert.deepEqual(d, { borrar: [], reemplazar: [], insertar: [] })
})

test('diferenciaAlertas: borra lo que ya no vale, reemplaza lo que cambió, inserta lo nuevo', () => {
  const ex = [
    { id: 'e1', ...al('stock_critico', 'p1', 's1') },
    { id: 'e2', ...al('sobrestock', 'p2', 's1', 'info', { max: 5 }) },
    { id: 'e3', ...al('vencimiento_30', 'p3', 's2', 'warning', {}, 'l1') },
  ]
  const nuevas = [
    al('stock_critico', 'p1', 's1', 'critica'),          // cambió la severidad
    al('vencimiento_30', 'p3', 's2', 'warning', {}, 'l1'), // igual
    al('vencimiento_30', 'p3', 's2', 'warning', {}, 'l2'), // otro lote: nueva
    al('stock_critico', 'p1', 's1', 'critica'),          // repetida en el lote: se ignora
  ]
  const d = diferenciaAlertas(ex, nuevas)
  assert.deepEqual(d.borrar, ['e2'])
  assert.deepEqual(d.reemplazar.map((r) => r.id), ['e1'])
  assert.deepEqual(d.insertar.map((i) => i.lote_id), ['l2'])
})

test('diferenciaAlertas: sin nuevas, borra todas; sin existentes, inserta todas', () => {
  const ex = [{ id: 'e1', ...al('stock_critico', 'p1', 's1') }]
  assert.deepEqual(diferenciaAlertas(ex, []).borrar, ['e1'])
  assert.equal(diferenciaAlertas([], [al('a', 'p', 's'), al('b', 'p', 's')]).insertar.length, 2)
})
