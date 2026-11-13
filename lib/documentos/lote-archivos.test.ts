import { test } from 'node:test'
import assert from 'node:assert/strict'

import { copiarArchivos, LIMITE_SUBIDA_BYTES, mensajeDeEstado, motivoParaNoSubir } from './lote-archivos'

/**
 * Una lista VIVA como `input.files`: cuando se vacía el input, queda en cero.
 * Reproduce el bug de la carga en lote sin navegador.
 */
function inputConArchivos(nombres: string[]) {
  const archivos = nombres.map((name) => ({ name, size: 1000, type: 'application/pdf' }))
  const lista: { length: number; [i: number]: (typeof archivos)[number] } = { length: archivos.length }
  archivos.forEach((a, i) => (lista[i] = a))
  return {
    files: lista,
    vaciar() {
      for (let i = 0; i < lista.length; i++) delete lista[i]
      lista.length = 0
    },
  }
}

test('el patrón viejo pierde los archivos: vaciar el input vacía la lista', () => {
  const input = inputConArchivos(['a.pdf', 'b.pdf'])
  const f = input.files
  input.vaciar()
  assert.equal(Array.from(f).length, 0)
})

test('copiar primero y vaciar después conserva los archivos', () => {
  const input = inputConArchivos(['a.pdf', 'b.pdf'])
  const f = copiarArchivos(input.files)
  input.vaciar()
  assert.deepEqual(f.map((x) => x.name), ['a.pdf', 'b.pdf'])
  assert.deepEqual(copiarArchivos(null), [])
})

test('tamaño: lo que Vercel cortaría se avisa antes, con el tamaño', () => {
  assert.equal(motivoParaNoSubir({ name: 'f.jpg', size: 900_000, type: 'image/jpeg' }), null)
  const m = motivoParaNoSubir({ name: 'f.pdf', size: 6 * 1024 * 1024, type: 'application/pdf' })
  assert.ok(m?.startsWith('Este PDF pesa 6 MB'))
  assert.equal(motivoParaNoSubir({ name: 'f.pdf', size: LIMITE_SUBIDA_BYTES, type: 'application/pdf' }), null)
  assert.ok(motivoParaNoSubir({ name: 'f.pdf', size: LIMITE_SUBIDA_BYTES + 1, type: 'application/pdf' }))
  assert.equal(motivoParaNoSubir({ name: 'v.pdf', size: 0, type: 'application/pdf' }), 'El archivo está vacío.')
})

test('un 413 sin JSON dice que es grande, no «probá de nuevo»', () => {
  assert.match(mensajeDeEstado(413), /demasiado grande/)
  assert.match(mensajeDeEstado(401), /sesión/)
})
