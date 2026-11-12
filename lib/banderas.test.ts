import assert from 'node:assert/strict'
import { test } from 'node:test'

import { bandera, BANDERAS, estadoDeBanderas } from './banderas'

test('todo nace apagado', () => {
  assert.ok(estadoDeBanderas({}).every((b) => !b.prendida))
})

test("sólo 'true' exacto prende", () => {
  for (const v of ['1', 'yes', 'TRUE', 'True', ' true', '']) {
    assert.equal(bandera('maestro_por_sucursal', { NORA_MAESTRO_POR_SUCURSAL: v }), false, JSON.stringify(v))
  }
  assert.equal(bandera('maestro_por_sucursal', { NORA_MAESTRO_POR_SUCURSAL: 'true' }), true)
})

test('la de Drive usa la misma variable que lib/drive/flag', () => {
  assert.equal(BANDERAS.ingesta_drive.env, 'DRIVE_INGESTA_ENABLED')
  assert.equal(bandera('ingesta_drive', { DRIVE_INGESTA_ENABLED: 'true' }), true)
})

test('no hay dos banderas con la misma variable', () => {
  const envs = Object.values(BANDERAS).map((b) => b.env)
  assert.equal(new Set(envs).size, envs.length)
})
