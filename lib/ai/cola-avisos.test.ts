import assert from 'node:assert/strict'
import { test } from 'node:test'

import { colaDeAvisos } from './cola-avisos'

function falso(pendientes: string[]) {
  const consultas: string[][] = []
  const insertadas: any[] = []
  const adm = {
    from: () => ({
      select: () => ({ in: (_c: string, claves: string[]) => ({ eq: async () => {
        consultas.push(claves)
        return { data: claves.filter((c) => pendientes.includes(c)).map((c) => ({ clave_dedup: c })), error: null }
      } }) }),
      insert: async (filas: any[]) => { insertadas.push(...filas); return { error: null } },
    }),
  }
  return { adm, consultas, insertadas }
}

test('la cola publica sólo lo nuevo, una vez, y los sin clave siempre', async () => {
  const cola = colaDeAvisos()
  cola.agregar({ tipo: 'x', titulo: 'ya pendiente', claveDedup: 'a' })
  cola.agregar({ tipo: 'x', titulo: 'nuevo', claveDedup: 'b' })
  cola.agregar({ tipo: 'x', titulo: 'repetido en la corrida', claveDedup: 'b' })
  cola.agregar({ tipo: 'x', titulo: 'sin clave' })
  const f = falso(['a'])
  assert.equal(await cola.vaciar(f.adm), 2)
  assert.deepEqual(f.insertadas.map((r) => r.titulo), ['nuevo', 'sin clave'])
  assert.equal(f.insertadas[0].estado, 'pendiente')
  assert.equal(f.insertadas[0].severidad, 'sugerencia')
  assert.equal(f.consultas.length, 1)
})

test('cien avisos son dos consultas de dedup, no cien', async () => {
  const cola = colaDeAvisos()
  for (let i = 0; i < 100; i++) cola.agregar({ tipo: 'x', titulo: `${i}`, claveDedup: `k${i}` })
  const f = falso([])
  assert.equal(await cola.vaciar(f.adm), 100)
  assert.equal(f.consultas.length, 2)
})
