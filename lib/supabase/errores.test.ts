import assert from 'node:assert/strict'
import { test } from 'node:test'

import { erroresDeLectura, esSinPermiso } from './errores'

test('junta sólo las lecturas que fallaron, con su nombre', () => {
  const e = erroresDeLectura({
    abiertos: { error: null },
    canales: { error: { message: 'canceling statement due to statement timeout' } },
    entregados: {},
  })
  assert.deepEqual(e, [{ que: 'canales', mensaje: 'canceling statement due to statement timeout' }])
})

test('distingue sin permiso de una consulta caída', () => {
  assert.equal(esSinPermiso('permission denied for table facturas_proveedor'), true)
  assert.equal(esSinPermiso('new row violates row-level security policy'), true)
  assert.equal(esSinPermiso('canceling statement due to statement timeout'), false)
})
