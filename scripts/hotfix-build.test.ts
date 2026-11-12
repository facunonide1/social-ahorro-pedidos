import assert from 'node:assert/strict'
import { test } from 'node:test'

import { esUsuarioAuditor, listarTodosLosUsuarios, motivoNoCrearUsuarios } from './usuarios-auth'
import { motivoSaltearSnapshot } from './snapshot-resumen'

test('crear usuarios de prueba pide el flag explícito', () => {
  assert.match(motivoNoCrearUsuarios({}) ?? '', /AUDITOR_CREAR_USUARIOS/)
  assert.match(motivoNoCrearUsuarios({ AUDITOR_CREAR_USUARIOS: 'true' }) ?? '', /AUDITOR_CREAR_USUARIOS/)
  assert.equal(motivoNoCrearUsuarios({ AUDITOR_CREAR_USUARIOS: '1' }), null)
})

test('en Vercel nunca se crean usuarios, aunque esté el flag', () => {
  assert.match(motivoNoCrearUsuarios({ VERCEL: '1', AUDITOR_CREAR_USUARIOS: '1' }) ?? '', /Vercel/)
})

test('esUsuarioAuditor reconoce el dominio sin importar mayúsculas', () => {
  assert.equal(esUsuarioAuditor('auditor.cajero@rls.test'), true)
  assert.equal(esUsuarioAuditor('Auditor.Cajero@RLS.TEST'), true)
  assert.equal(esUsuarioAuditor('alguien@rls.test.com'), false)
  assert.equal(esUsuarioAuditor(null), false)
})

test('listarTodosLosUsuarios recorre todas las páginas, no sólo la primera', async () => {
  const total = 2_503
  const pedidas: number[] = []
  const adm = {
    auth: {
      admin: {
        listUsers: async ({ page, perPage }: { page: number; perPage: number }) => {
          pedidas.push(page)
          const desde = (page - 1) * perPage
          const n = Math.max(0, Math.min(perPage, total - desde))
          return { data: { users: Array.from({ length: n }, (_, i) => ({ id: String(desde + i) })) }, error: null }
        },
      },
    },
  } as any
  const usuarios = await listarTodosLosUsuarios(adm, { porPagina: 1000 })
  assert.equal(usuarios.length, total)
  assert.deepEqual(pedidas, [1, 2, 3])
})

test('listarTodosLosUsuarios corta con error si la API falla', async () => {
  const adm = { auth: { admin: { listUsers: async () => ({ data: null, error: { message: 'boom' } }) } } } as any
  await assert.rejects(listarTodosLosUsuarios(adm), /boom/)
})

test('el snapshot sólo sirve si es reciente', () => {
  const ahora = new Date('2026-11-12T20:00:00Z')
  assert.equal(motivoSaltearSnapshot('2026-11-12T19:50:00Z', ahora), null)
  assert.match(motivoSaltearSnapshot('2026-11-12T05:00:00Z', ahora) ?? '', /900 min/)
  assert.match(motivoSaltearSnapshot(null, ahora) ?? '', /nunca/)
  assert.match(motivoSaltearSnapshot('no-es-fecha', ahora) ?? '', /ilegible/)
})
