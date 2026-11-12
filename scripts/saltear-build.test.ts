import assert from 'node:assert/strict'
import { test } from 'node:test'

import { ENV_AUDITOR_RLS, motivoFaltanEnv, motivoSaltearAuditor } from './saltear-build'

const COMPLETAS = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://ejemplo.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
}

test('en production, con las env, el auditor corre', () => {
  assert.equal(motivoSaltearAuditor({ ...COMPLETAS, VERCEL_ENV: 'production' }), null)
})

test('preview se saltea aunque estén las env', () => {
  const motivo = motivoSaltearAuditor({ ...COMPLETAS, VERCEL_ENV: 'preview' })
  assert.match(motivo ?? '', /VERCEL_ENV=preview/)
})

test('sin VERCEL_ENV se saltea: el build local no es production', () => {
  const motivo = motivoSaltearAuditor({ ...COMPLETAS })
  assert.match(motivo ?? '', /VERCEL_ENV=undefined/)
})

test('production sin URL se saltea y nombra la variable', () => {
  const { NEXT_PUBLIC_SUPABASE_URL: _url, ...sinUrl } = COMPLETAS
  const motivo = motivoSaltearAuditor({ ...sinUrl, VERCEL_ENV: 'production' })
  assert.match(motivo ?? '', /NEXT_PUBLIC_SUPABASE_URL/)
})

test('las tres env del auditor están en la lista', () => {
  assert.deepEqual([...ENV_AUDITOR_RLS], [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
  ])
})

test('motivoFaltanEnv no saltea un build local que sí tiene las variables', () => {
  assert.equal(
    motivoFaltanEnv(COMPLETAS, ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']),
    null,
  )
})

test('motivoFaltanEnv avisa si falta la URL', () => {
  assert.match(
    motivoFaltanEnv({}, ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) ?? '',
    /NEXT_PUBLIC_SUPABASE_URL/,
  )
})
