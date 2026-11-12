import assert from 'node:assert/strict'
import { test } from 'node:test'

import { clavesYaPendientes, enTandas, insertarEnTandas, soloNuevos, TANDA_CLAVES } from './dedup'

/** Un doble de supabase-js que registra cada consulta y cada insert. */
function falso({ pendientes = [] as string[], fallaSelect = false, fallaInsertEn = -1 } = {}) {
  const consultas: string[][] = []
  const inserts: unknown[][] = []
  const adm = {
    from: (_t: string) => ({
      select: () => ({
        in: (_c: string, claves: string[]) => ({
          eq: async () => {
            consultas.push(claves)
            if (fallaSelect) return { data: null, error: { message: 'header too large' } }
            return { data: claves.filter((c) => pendientes.includes(c)).map((c) => ({ clave_dedup: c })), error: null }
          },
        }),
      }),
      insert: async (filas: unknown[]) => {
        if (inserts.length === fallaInsertEn) return { error: { message: 'boom' } }
        inserts.push(filas)
        return { error: null }
      },
    }),
  }
  return { adm, consultas, inserts }
}

test('enTandas parte sin perder ni repetir', () => {
  assert.deepEqual(enTandas([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]])
  assert.deepEqual(enTandas([], 3), [])
})

test('las claves viajan en tandas chicas, ninguna consulta pasa el tope', async () => {
  const claves = Array.from({ length: 1234 }, (_, i) => `vencimiento:proveedor-${i}:2026-11-${i % 28}`)
  const { adm, consultas } = falso({ pendientes: [claves[3], claves[1200]] })
  const ya = await clavesYaPendientes(adm, claves)
  assert.equal(consultas.length, Math.ceil(1234 / TANDA_CLAVES))
  assert.ok(consultas.every((c) => c.length <= TANDA_CLAVES))
  // La 1200 ya no se pierde por el tope viejo de 500.
  assert.deepEqual([...ya].sort(), [claves[1200], claves[3]].sort())
})

test('si el select falla, corta: no publica todo como nuevo', async () => {
  const { adm } = falso({ fallaSelect: true })
  await assert.rejects(clavesYaPendientes(adm, ['a', 'b']), /header too large/)
})

test('soloNuevos saca los pendientes y los repetidos del mismo lote', () => {
  const h = [{ clave: 'a' }, { clave: 'b' }, { clave: 'a' }, { clave: '' }, { clave: 'c' }]
  assert.deepEqual(soloNuevos(h, new Set(['b'])).map((x) => x.clave), ['a', 'c'])
})

test('insertarEnTandas inserta por partes y corta en el primer error', async () => {
  const filas = Array.from({ length: 450 }, (_, i) => ({ i }))
  const ok = falso()
  assert.equal(await insertarEnTandas(ok.adm, 'nora_avisos', filas, 200), 450)
  assert.deepEqual(ok.inserts.map((g) => g.length), [200, 200, 50])

  const mal = falso({ fallaInsertEn: 1 })
  await assert.rejects(insertarEnTandas(mal.adm, 'nora_avisos', filas, 200), /llevaba 200/)
})
