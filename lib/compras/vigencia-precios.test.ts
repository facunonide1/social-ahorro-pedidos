import assert from 'node:assert/strict'
import { test } from 'node:test'

import { decidirVigencia, fechaIso, partirPorFecha, precioNetoPagado } from './vigencia-precios'

test('la fecha de vigencia no es la de carga', () => {
  assert.equal(fechaIso('2026-11-06 00:00:00'), '2026-11-06')
  assert.equal(fechaIso('06/10/2026'), '2026-10-06')
  assert.equal(fechaIso('06 de noviembre de 2026'), '2026-11-06')
})

test('los precios se ordenan por fecha y el último de cada origen queda vigente', () => {
  const v = partirPorFecha([
    { productoId: 'p', proveedorId: 'd', origen: 'lista', fecha: '2026-09-01', precio: 100 },
    { productoId: 'p', proveedorId: 'd', origen: 'lista', fecha: '2026-11-01', precio: 120 },
    { productoId: 'p', proveedorId: 'd', origen: 'factura', fecha: '2026-10-15', precio: 90 },
    { productoId: 'p', proveedorId: 'd', origen: 'factura', fecha: '2026-11-02', precio: 95 },
  ])
  assert.equal(v.lista?.precio, 120)
  assert.equal(v.lista?.fecha, '2026-11-01')
  assert.equal(v.factura?.precio, 95)
  assert.equal(v.factura?.fecha, '2026-11-02')
  assert.deepEqual(v.anteriores.map((e) => e.precio), [90, 100])
})

test('una lista más vieja no reemplaza a la vigente', () => {
  assert.equal(decidirVigencia({ fecha: '2026-11-01' }, '2026-10-06'), 'historial')
  assert.equal(decidirVigencia({ fecha: '2026-10-06' }, '2026-11-01'), 'reemplaza')
  assert.equal(decidirVigencia({ fecha: '2026-11-01' }, '2026-11-01'), 'reemplaza')
  assert.equal(decidirVigencia(null, '2026-10-06'), 'reemplaza')
})

test('el precio de factura es el unitario neto, con el descuento ya restado', () => {
  assert.equal(precioNetoPagado({ unitario: 100, descuento: 10, importe: 180, cantidad: 2 }), 90)
  assert.equal(precioNetoPagado({ unitario: 100, descuento: 0.1, importe: null, cantidad: null }), 90)
  assert.equal(precioNetoPagado({ unitario: 13894.38, descuento: null, importe: 13894.38, cantidad: 1 }), 13894.38)
})
