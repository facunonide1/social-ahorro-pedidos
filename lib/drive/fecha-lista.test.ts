import assert from 'node:assert/strict'
import { test } from 'node:test'

import { esMasVieja, fechaDeLista, parsearFechaTexto } from './fecha-lista'

test('parsea las formas en que vienen las fechas en listas y nombres', () => {
  assert.equal(parsearFechaTexto('12/11/2026'), '2026-11-12')
  assert.equal(parsearFechaTexto('Lista Monroe 12-11-26.xlsx'), '2026-11-12')
  assert.equal(parsearFechaTexto('precios_2026-10-05.xlsx'), '2026-10-05')
  assert.equal(parsearFechaTexto('12 de noviembre de 2026'), '2026-11-12')
  assert.equal(parsearFechaTexto('Lista de precios: 3 de Octubre de 2026'), '2026-10-03')
  assert.equal(parsearFechaTexto('NORMA nov 2026.xlsx'), '2026-11-01')
  assert.equal(parsearFechaTexto('Ceos Septiembre-26.xls'), '2026-09-01')
})

test('no inventa fechas', () => {
  assert.equal(parsearFechaTexto('Lista Monroe.xlsx'), null)
  assert.equal(parsearFechaTexto('31/02/2026'), null)
  assert.equal(parsearFechaTexto('codigo 7790010000012'), null)
  assert.equal(parsearFechaTexto('mayorsur 1500 items'), null)
  assert.equal(parsearFechaTexto(null), null)
})

test('fechaDeLista: contenido > nombre > Drive > hoy', () => {
  const hoy = new Date('2026-11-13T12:00:00Z')
  assert.deepEqual(fechaDeLista({ vigenteDesde: '01/11/2026', nombreArchivo: 'x 05-11-26', hoy }), { fecha: '2026-11-01', de: 'contenido' })
  assert.deepEqual(fechaDeLista({ nombreArchivo: 'Lista 05-11-26.xlsx', modifiedTime: '2026-11-10T00:00:00Z', hoy }), { fecha: '2026-11-05', de: 'nombre' })
  assert.deepEqual(fechaDeLista({ nombreArchivo: 'Lista.xlsx', modifiedTime: '2026-11-10T15:00:00Z', hoy }), { fecha: '2026-11-10', de: 'drive' })
  assert.deepEqual(fechaDeLista({ nombreArchivo: 'Lista.xlsx', hoy }), { fecha: '2026-11-13', de: 'hoy' })
})

test('una lista más vieja que la vigente no la reemplaza', () => {
  assert.equal(esMasVieja('2026-10-01', '2026-11-01'), true)
  assert.equal(esMasVieja('2026-11-01', '2026-11-01'), false)
  assert.equal(esMasVieja('2026-12-01', '2026-11-01'), false)
  assert.equal(esMasVieja('2026-10-01', null), false)
})
