import assert from 'node:assert/strict'
import { test } from 'node:test'

import { armarBusqueda, equivalentesDe, parsearConsulta, rankearOfertas } from './donde-comprar'

test('la consulta distingue EAN, código interno y texto', () => {
  assert.deepEqual(parsearConsulta('7790000000001'), { tipo: 'ean', valor: '7790000000001' })
  assert.deepEqual(parsearConsulta('W00500'), { tipo: 'codigo', valor: 'W00500' })
  assert.deepEqual(parsearConsulta('ibuprofeno 400'), { tipo: 'texto', valor: 'ibuprofeno 400' })
})

test('ordena de menor a mayor, marca la más barata y avisa si la lista es vieja', () => {
  const ahora = new Date('2026-11-12T00:00:00Z')
  const r = rankearOfertas([
    {
      proveedorId: 'a', proveedor: 'Cara', precio: 200, precioFinal: 200,
      fechaLista: '2026-11-01', vigente: true, condiciones: '15 días', bonificacion: null,
      plazo: '15 días', formaPago: null, origen: 'drive:1', matchVia: 'nombre', matchScore: 0.8,
    },
    {
      proveedorId: 'b', proveedor: 'Barata', precio: 100, precioFinal: 90,
      fechaLista: '2026-08-01', vigente: true, condiciones: null, bonificacion: '30%',
      plazo: null, formaPago: 'contado', origen: 'planilla', matchVia: 'nombre', matchScore: 0.9,
    },
  ], ahora, 30)
  assert.equal(r[0].proveedor, 'Barata')
  assert.equal(r[0].esLaMasBarata, true)
  assert.equal(r[0].listaVieja, true)
  assert.equal(r[1].esLaMasBarata, false)
  assert.equal(r[1].listaVieja, false)
})

test('equivalente por droga y concentración, y mismo EAN cuando lo hay', () => {
  const base = { id: '1', nombre: 'Marca A 500 mg x 30', ean: '7791', droga: 'ibuprofeno', presentacion: 'comp x 30' }
  const eq = equivalentesDe(base, [
    base,
    { id: '2', nombre: 'Marca B 500 mg x 16', ean: null, droga: 'ibuprofeno', presentacion: 'comp x 16' },
    { id: '3', nombre: 'Otra cosa 10 mg', ean: '7791', droga: 'otro', presentacion: 'x 10' },
    { id: '4', nombre: 'Marca C 400 mg', ean: null, droga: 'ibuprofeno', presentacion: '400 mg' },
  ])
  assert.ok(eq.some((e) => e.productoId === '3' && e.relacion === 'mismo EAN'))
  assert.ok(eq.some((e) => e.productoId === '2' && e.relacion === 'equivalente sugerido'))
  assert.equal(eq.some((e) => e.productoId === '4'), false)
})

test('el armado de la búsqueda deja primera a la oferta más barata', () => {
  const r = armarBusqueda({
    q: 'ejemplo 500',
    productos: [{ id: 'p', nombre: 'Ejemplo 500 mg', sku: 'A1', ean: null, droga: 'ejemplo', presentacion: 'x 10' }],
    ofertas: [
      { proveedorId: '2', proveedor: 'Cara', precio: 20, precioFinal: 20, fechaLista: '2026-11-01', vigente: true, condiciones: null, bonificacion: null, plazo: null, formaPago: null, origen: 'job-2', matchVia: 'nombre', matchScore: 0.8 },
      { proveedorId: '1', proveedor: 'Barata', precio: 10, precioFinal: 10, fechaLista: '2026-11-10', vigente: true, condiciones: 'mínimo 1', bonificacion: null, plazo: '21 días', formaPago: 'cuenta corriente', origen: 'drive:abc', matchVia: 'nombre', matchScore: 0.9 },
    ],
    catalogoEquivalentes: [],
    ahora: new Date('2026-11-12T00:00:00Z'),
  })
  assert.equal(r.producto?.id, 'p')
  assert.equal(r.ofertas[0].proveedor, 'Barata')
  assert.equal(r.ofertas[0].esLaMasBarata, true)
  assert.equal(r.ofertas[0].origen, 'drive:abc')
})
