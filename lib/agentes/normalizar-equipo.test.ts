import assert from 'node:assert/strict'
import { test } from 'node:test'

import { normalizarListas } from './normalizar-equipo'

test('EquipoClient puede filtrar decisiones y equipo nulos', () => {
  const { equipo, decisiones } = normalizarListas<
    { encendido: boolean },
    { clave: string; costo_por_dia: number | null }
  >(null, null)

  const resueltas: string[] = []
  const pendientes = (decisiones ?? []).filter((d) => !resueltas.includes(d.clave))
  const encendidos = (equipo ?? []).filter((a) => a.encendido)
  const apagados = (equipo ?? []).filter((a) => !a.encendido)

  assert.deepEqual(pendientes, [])
  assert.deepEqual(encendidos, [])
  assert.deepEqual(apagados, [])
})

test('undefined tampoco rompe el filtro', () => {
  const { equipo, decisiones } = normalizarListas(undefined, undefined)
  assert.deepEqual((decisiones ?? []).filter(() => true), [])
  assert.deepEqual((equipo ?? []).filter(() => true), [])
})

test('las filas que sí vinieron se conservan', () => {
  const { equipo, decisiones } = normalizarListas(
    [{ encendido: false }, { encendido: true }],
    [{ clave: 'firma-1', costo_por_dia: 10 }],
  )
  assert.equal((equipo ?? []).filter((a) => a.encendido).length, 1)
  assert.equal((equipo ?? []).filter((a) => !a.encendido).length, 1)
  assert.equal((decisiones ?? []).filter((d) => d.clave === 'firma-1').length, 1)
})
