import assert from 'node:assert/strict'
import { test } from 'node:test'

import { destinoPedidos, destinoRaiz } from './destino'

const adminOn = { activo: true }, adminOff = { activo: false }
const ped = (role: string, active = true) => ({ role, active })

test('raíz: NORA gana; después repartidor o dashboard; si no, diagnóstico', () => {
  assert.equal(destinoRaiz(adminOn, ped('operador')), '/admin')
  assert.equal(destinoRaiz(adminOn, null), '/admin')
  assert.equal(destinoRaiz(adminOff, ped('repartidor')), '/repartidor')
  assert.equal(destinoRaiz(null, ped('operador')), '/dashboard')
  assert.equal(destinoRaiz(adminOff, ped('operador', false)), 'diagnostico')
  assert.equal(destinoRaiz(null, null), 'diagnostico')
})

test('/pedidos: se queda el operador; el repartidor a lo suyo', () => {
  assert.equal(destinoPedidos(null, ped('admin')), 'quedarse')
  assert.equal(destinoPedidos(adminOn, ped('operador')), 'quedarse')
  assert.equal(destinoPedidos(adminOn, ped('repartidor')), '/repartidor')
})

test('/pedidos: alguien de NORA sin fila de pedidos va al listado de NORA, no al logout (#8)', () => {
  assert.equal(destinoPedidos(adminOn, null), '/admin/pedidos')
  assert.equal(destinoPedidos(adminOn, ped('operador', false)), '/admin/pedidos')
})

test('/pedidos: sin ningún perfil activo, logout con motivo', () => {
  assert.equal(destinoPedidos(adminOff, null), '/logout?reason=sin_permiso')
  assert.equal(destinoPedidos(null, ped('operador', false)), '/logout?reason=sin_permiso')
})
