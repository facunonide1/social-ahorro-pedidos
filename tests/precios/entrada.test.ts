/**
 * El comparador de precios: lo que se puede probar sin base.
 *
 *   npx tsx --test tests/precios/*.test.ts
 *
 * Las reglas de plausibilidad viven en SQL (una sola versión de la regla) y se
 * prueban contra un Postgres local en scripts/precios-probar-migracion.sh.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { banderaPrendida } from '../../lib/banderas'
import { claveValida, leerIngesta, leerCsvDeSheets, urlDeExportacion } from '../../lib/precios/entrada'

test('bandera: ausente es apagada', () => {
  assert.equal(banderaPrendida('comparador_precios', {}), false)
})

test('bandera: solo «on» la prende; «true», «1» o «ON » no', () => {
  assert.equal(banderaPrendida('comparador_precios', { NORA_BANDERA_COMPARADOR_PRECIOS: 'on' }), true)
  for (const v of ['true', '1', 'ON ', 'yes', '']) {
    assert.equal(banderaPrendida('comparador_precios', { NORA_BANDERA_COMPARADOR_PRECIOS: v }), false, v)
  }
})

test('clave: sin clave configurada nadie entra, ni con la clave vacía', () => {
  assert.equal(claveValida('', undefined), false)
  assert.equal(claveValida('x', undefined), false)
  assert.equal(claveValida('', ''), false)
})

test('clave: compara exacto, distinto largo no revienta', () => {
  assert.equal(claveValida('abc123', 'abc123'), true)
  assert.equal(claveValida('abc124', 'abc123'), false)
  assert.equal(claveValida('abc', 'abc123'), false)
  assert.equal(claveValida(null, 'abc123'), false)
})

test('ingesta: acepta el formato del bot', () => {
  const r = leerIngesta({
    fuente: 'grok_bot',
    filas: [{ proveedor: 'Del Sud', cuit: '30-12345678-9', codigo_barras: '7790001000011',
              descripcion: 'IBUPIRAC 600 x 10', precio: 3210.5, capturado_at: '2026-11-04T10:00:00-03:00' }],
  })
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.filas.length, 1)
    assert.equal(r.filas[0].cuit, '30123456789') // solo dígitos
    assert.equal(r.filas[0].precio, 3210.5)
  }
})

test('ingesta: un precio con coma decimal argentina se lee bien; uno con miles ambiguos no se adivina', () => {
  const ok = leerIngesta({ fuente: 'grok_bot', filas: [{ proveedor: 'X', codigo_barras: '1', precio: '3.210,50', capturado_at: '2026-11-04T10:00:00Z' }] })
  assert.equal(ok.ok, true)
  if (ok.ok) assert.equal(ok.filas[0].precio, 3210.5)
  const amb = leerIngesta({ fuente: 'grok_bot', filas: [{ proveedor: 'X', codigo_barras: '1', precio: '3.210', capturado_at: '2026-11-04T10:00:00Z' }] })
  assert.equal(amb.ok, true)
  // «3.210» puede ser tres mil o tres con veintiuno: queda null, y la base lo rechaza diciendo por qué.
  if (amb.ok) assert.equal(amb.filas[0].precio, null)
})

test('ingesta: sin código de barras (aunque traiga sku), o sin proveedor, la fila se rechaza con el motivo', () => {
  const r = leerIngesta({ fuente: 'grok_bot', filas: [
    { proveedor: 'X', sku: 'ABC-1', precio: 10, capturado_at: '2026-11-04T10:00:00Z' },
    { codigo_barras: '1', precio: 10, capturado_at: '2026-11-04T10:00:00Z' },
  ] })
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.filas.length, 0)
    assert.equal(r.descartadas.length, 2)
    assert.match(r.descartadas[0].motivo, /código de barras/)
    assert.match(r.descartadas[1].motivo, /proveedor/)
  }
})

test('ingesta: fuente desconocida, cuerpo que no es objeto o demasiadas filas → error', () => {
  assert.equal(leerIngesta({ fuente: 'otra', filas: [] }).ok, false)
  assert.equal(leerIngesta('hola').ok, false)
  assert.equal(leerIngesta({ fuente: 'grok_bot', filas: Array.from({ length: 5001 }, () => ({})) }).ok, false)
})

test('sheets: solo docs.google.com, y se arma la exportación a CSV', () => {
  assert.equal(
    urlDeExportacion('https://docs.google.com/spreadsheets/d/1AbC_dEf-123/edit#gid=456'),
    'https://docs.google.com/spreadsheets/d/1AbC_dEf-123/export?format=csv&gid=456')
  assert.equal(
    urlDeExportacion('https://docs.google.com/spreadsheets/d/1AbC_dEf-123/edit'),
    'https://docs.google.com/spreadsheets/d/1AbC_dEf-123/export?format=csv&gid=0')
  for (const malo of ['https://evil.com/spreadsheets/d/x/edit', 'http://docs.google.com/spreadsheets/d/x/edit',
                      'https://docs.google.com.evil.com/spreadsheets/d/x/edit', 'file:///etc/passwd', 'nada']) {
    assert.equal(urlDeExportacion(malo), null, malo)
  }
})

test('sheets: el CSV se lee por nombre de columna, con comillas y comas adentro', () => {
  const csv = 'Proveedor,CUIT,Código de barras,Descripción,Precio,Leído\n' +
              '"Del Sud",30-12345678-9,7790001000011,"IBUPIRAC 600, x 10","3.210,50",2026-11-04 10:00\n' +
              'Monroe,,7790001000011,IBUPIRAC 600 x10,3300,2026-11-04 09:30\n'
  const filas = leerCsvDeSheets(csv)
  assert.equal(filas.length, 2)
  assert.equal(filas[0].proveedor, 'Del Sud')
  assert.equal(filas[0].descripcion, 'IBUPIRAC 600, x 10')
  assert.equal(filas[0].precio, '3.210,50')
  assert.equal(filas[1].cuit, undefined)
})

test('sheets: sin la columna de precio no se adivina cuál es', () => {
  assert.throws(() => leerCsvDeSheets('Proveedor,Código de barras,Importe raro\nX,1,10\n'), /precio/)
})
