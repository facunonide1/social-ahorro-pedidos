/**
 * Las rutas del comparador con la bandera apagada no existen (404), y con la
 * bandera prendida la ingesta no entra sin la clave. No llegan a la base.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'

const BANDERA = 'NORA_BANDERA_COMPARADOR_PRECIOS'

function pedido(url: string, init?: { method?: string; body?: unknown; headers?: Record<string, string> }) {
  return new NextRequest(new URL(url, 'http://localhost'), {
    method: init?.method ?? 'GET',
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  })
}

test('bandera apagada: las tres rutas responden 404', async () => {
  delete process.env[BANDERA]
  const ingest = await import('../../app/api/precios/ingest/route')
  const sheets = await import('../../app/api/precios/importar-sheets/route')
  const mejor = await import('../../app/api/precios/mejor/route')
  assert.equal((await ingest.POST(pedido('/api/precios/ingest', { method: 'POST', body: {} }))).status, 404)
  assert.equal((await sheets.POST(pedido('/api/precios/importar-sheets', { method: 'POST', body: {} }))).status, 404)
  assert.equal((await mejor.GET(pedido('/api/precios/mejor?producto=x'))).status, 404)
})

test('bandera «true» no es «on»: sigue 404', async () => {
  process.env[BANDERA] = 'true'
  const ingest = await import('../../app/api/precios/ingest/route')
  assert.equal((await ingest.POST(pedido('/api/precios/ingest', { method: 'POST', body: {} }))).status, 404)
  delete process.env[BANDERA]
})

test('bandera prendida: sin clave configurada, 401 aunque manden una', async () => {
  process.env[BANDERA] = 'on'
  delete process.env.PRECIOS_INGEST_CLAVE
  const ingest = await import('../../app/api/precios/ingest/route')
  const r = await ingest.POST(pedido('/api/precios/ingest', {
    method: 'POST', body: { fuente: 'grok_bot', filas: [] }, headers: { 'x-nora-precios-clave': 'cualquiera' },
  }))
  assert.equal(r.status, 401)
  delete process.env[BANDERA]
})

test('bandera prendida y clave configurada: la clave equivocada da 401, y un cuerpo malo 400', async () => {
  process.env[BANDERA] = 'on'
  process.env.PRECIOS_INGEST_CLAVE = 'clave-de-prueba-local'
  const ingest = await import('../../app/api/precios/ingest/route')
  const mala = await ingest.POST(pedido('/api/precios/ingest', {
    method: 'POST', body: { fuente: 'grok_bot', filas: [] }, headers: { 'x-nora-precios-clave': 'otra' },
  }))
  assert.equal(mala.status, 401)
  const cuerpo = await ingest.POST(pedido('/api/precios/ingest', {
    method: 'POST', body: { fuente: 'otra', filas: [] }, headers: { 'x-nora-precios-clave': 'clave-de-prueba-local' },
  }))
  assert.equal(cuerpo.status, 400)
  delete process.env[BANDERA]
  delete process.env.PRECIOS_INGEST_CLAVE
})

test('mejor: un uuid hecho de guiones o días fraccionarios dan 400 antes de la sesión y de la base', async () => {
  process.env[BANDERA] = 'on'
  const mejor = await import('../../app/api/precios/mejor/route')
  const uuid = '3fa85f64-5717-4562-b3fc-2c963f66afa6'
  assert.equal((await mejor.GET(pedido('/api/precios/mejor?producto=' + '-'.repeat(36)))).status, 400)
  assert.equal((await mejor.GET(pedido(`/api/precios/mejor?producto=${uuid}&dias=1.5`))).status, 400)
  assert.equal((await mejor.GET(pedido(`/api/precios/mejor?producto=${uuid}&dias=0`))).status, 400)
  assert.equal((await mejor.GET(pedido(`/api/precios/mejor?producto=${uuid}&dias=91`))).status, 400)
  delete process.env[BANDERA]
})
