import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { test } from 'node:test'

import { firmaValida, fueraDeHorario, horaBuenosAires, mapearItems, tipoEnvio } from './mapear'

const envio = (...m: [string, string][]) => ({ shipping_lines: m.map(([method_id, method_title]) => ({ method_id, method_title })) as any })

test('tipo de envío: express, retiro y programado por defecto', () => {
  assert.equal(tipoEnvio(envio(['flat_rate', 'Envío Express 2hs'])), 'express')
  assert.equal(tipoEnvio(envio(['local_pickup', 'Retiro en sucursal'])), 'retiro')
  assert.equal(tipoEnvio(envio(['flat_rate', 'Envío a domicilio'])), 'programado')
  assert.equal(tipoEnvio({ shipping_lines: undefined as any }), 'programado')
})

test('horario en Buenos Aires (UTC-3), con medianoche como 0', () => {
  assert.equal(horaBuenosAires('2026-11-12T03:00:00Z'), 0)
  assert.equal(horaBuenosAires('2026-11-12T11:30:00Z'), 8)
  // 07:59 en BA es fuera; 08:00 adentro; 20:00 fuera.
  assert.equal(fueraDeHorario('2026-11-12T10:59:00Z', 8, 20), true)
  assert.equal(fueraDeHorario('2026-11-12T11:00:00Z', 8, 20), false)
  assert.equal(fueraDeHorario('2026-11-12T23:00:00Z', 8, 20), true)
  assert.equal(fueraDeHorario(null, 8, 20), false)
})

test('ítems: precio del ítem o, si falta, total / cantidad', () => {
  const items = mapearItems([
    { product_id: 1, name: 'Ibuprofeno', quantity: 2, price: 1500, total: '3000', sku: 'IBU', meta_data: [] },
    { product_id: 2, name: 'Gasas', quantity: 3, price: 0, total: '900', sku: '', meta_data: [{ key: 'k', value: 'v' }] },
  ] as any)
  assert.deepEqual(items.map((i) => i.price), [1500, 300])
  assert.equal(items[1].sku, undefined)
  assert.deepEqual(items[1].meta, { meta_data: [{ key: 'k', value: 'v' }] })
  assert.equal(items[0].meta, undefined)
})

test('firma del webhook: acepta la de Woo y rechaza todo lo demás', () => {
  const body = '{"id":123,"status":"processing"}'
  const firma = createHmac('sha256', 'secreto').update(body, 'utf8').digest('base64')
  assert.equal(firmaValida(body, firma, 'secreto'), true)
  assert.equal(firmaValida(body + ' ', firma, 'secreto'), false)
  assert.equal(firmaValida(body, firma, 'otro'), false)
  assert.equal(firmaValida(body, '', 'secreto'), false)
  assert.equal(firmaValida(body, null, 'secreto'), false)
  assert.equal(firmaValida(body, 'corta', 'secreto'), false)
})
