import assert from 'node:assert/strict'
import { test } from 'node:test'

import { motivoPinDebil } from './pin'

test('rechaza PINs que se adivinan primero', () => {
  for (const p of ['0000', '1111', '1234', '4321', '7890', '9012', '0987', '1212', '6969', '1221', '1985', '2026', '2039']) {
    assert.notEqual(motivoPinDebil(p), null, p)
  }
})

test('acepta PINs que no siguen un patrón', () => {
  for (const p of ['4826', '7351', '0592', '8163', '2741']) {
    assert.equal(motivoPinDebil(p), null, p)
  }
})

test('rechaza el PIN que sale del N° de empleado', () => {
  assert.match(motivoPinDebil('4826', 'E-04826') ?? '', /empleado/)
  assert.equal(motivoPinDebil('4826', '00731'), null)
})

test('rechaza lo que no son 4 dígitos', () => {
  for (const p of ['123', '12345', 'abcd', '']) assert.match(motivoPinDebil(p) ?? '', /4 dígitos/)
})
