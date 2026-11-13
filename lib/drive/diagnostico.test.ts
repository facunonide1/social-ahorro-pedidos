import assert from 'node:assert/strict'
import { test } from 'node:test'

import { diagnosticar } from './diagnostico'

const base = {
  ahora: new Date('2026-11-13T18:00:00Z'),
  habilitada: true,
  cronSecret: true,
  conexion: { estado: 'conectada', last_error: null, listado_cursor: null },
  carpetas: [
    { folder_id: 'a', folder_nombre: 'compras farmacias', incluir_subcarpetas: true },
    { folder_id: 'b', folder_nombre: 'Compras Farmacias (privado)', incluir_subcarpetas: true },
  ],
  procesando: [] as { nombre: string; updated_at: string | null }[],
  pendientes: [] as any[],
}

test('todo en orden: sin avisos', () => {
  assert.deepEqual(diagnosticar(base), [])
})

test('falta la carpeta de listas: lo dice con su nombre', () => {
  const a = diagnosticar({ ...base, carpetas: [base.carpetas[1]] })
  assert.equal(a.length, 1)
  assert.match(a[0].texto, /Falta la carpeta «compras farmacias»/)
  assert.equal(a[0].nivel, 'error')
})

test('sin CRON_SECRET o deshabilitada: errores que explican por qué el cron no hace nada', () => {
  const a = diagnosticar({ ...base, cronSecret: false, habilitada: false })
  assert.ok(a.some((x) => /CRON_SECRET/.test(x.texto)))
  assert.ok(a.some((x) => /DRIVE_INGESTA_ENABLED/.test(x.texto)))
})

test('el procesando de las 16:36 se marca como trabado', () => {
  const a = diagnosticar({ ...base, procesando: [{ nombre: 'Compras y precios por droguería', updated_at: '2026-11-13T16:36:00Z' }] })
  assert.match(a[0].texto, /quedó en procesando hace 84 min/)
})

test('el próximo pendiente sale por prioridad: la planilla antes que el maestro', () => {
  const a = diagnosticar({ ...base, pendientes: [
    { nombre: 'maestro figueiras.xls', clasificacion: 'maestro', bytes: 44_000_000 },
    { nombre: 'Compras y precios por droguería', clasificacion: 'planilla', bytes: null },
  ] })
  assert.match(a.at(-1)!.texto, /El próximo: «Compras y precios por droguería»/)
})
