import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'

import type { FuenteArchivos, NodoFuente } from './fuente'
import { fuenteDrive } from '../drive/fuente-drive'
import { MIME_CARPETA, tareasIniciales, tomarPagina } from '../drive/recorrer'

/**
 * Una fuente en memoria: carpetas → páginas de nodos. Es lo que va a poder
 * reemplazar a Drive (FIND, o un test) sin tocar la ingesta.
 */
function fuenteFalsa(arbol: Record<string, NodoFuente[][]>): FuenteArchivos & { pedidas: string[] } {
  const pedidas: string[] = []
  return {
    nombre: 'falsa',
    pedidas,
    async listarPagina(carpeta, pageToken) {
      pedidas.push(`${carpeta}#${pageToken ?? 0}`)
      const paginas = arbol[carpeta] ?? [[]]
      const i = pageToken ? Number(pageToken) : 0
      return { files: paginas[i] ?? [], nextPageToken: i + 1 < paginas.length ? String(i + 1) : null }
    },
    async descargar(a) { return Buffer.from(`contenido de ${a.id}`) },
  }
}

const archivo = (id: string, modifiedTime = '2026-11-10T00:00:00Z'): NodoFuente =>
  ({ id, name: `${id}.xlsx`, mimeType: 'application/vnd.ms-excel', modifiedTime })
const carpeta = (id: string): NodoFuente => ({ id, name: id, mimeType: MIME_CARPETA })

test('la ingesta recorre una fuente cualquiera: páginas, subcarpetas y fecha', async () => {
  const f = fuenteFalsa({
    raiz: [[archivo('a'), carpeta('sub')], [archivo('b', '2026-01-01T00:00:00Z')]],
    sub: [[archivo('c')]],
  })
  let tareas = tareasIniciales([{ folderId: 'raiz', folderNombre: 'compras farmacias', incluirSubcarpetas: true }])
  const vistos = new Set<string>()
  const ids: string[] = []
  while (tareas.length) {
    const paso = await tomarPagina(tareas, (id, page) => f.listarPagina(id, page),
      { maxProfundidad: 5, modificadoDespues: '2026-06-01T00:00:00Z', vistos })
    tareas = paso.tareas
    ids.push(...paso.archivos.map((a) => a.fileId))
  }
  // «b» es más viejo que el último sync: no se vuelve a encolar.
  assert.deepEqual(ids.sort(), ['a', 'c'])
  assert.deepEqual(f.pedidas, ['raiz#0', 'raiz#1', 'sub#0'])
  assert.equal((await f.descargar({ id: 'a', mime: 'x' })).toString(), 'contenido de a')
})

const fetchOriginal = globalThis.fetch
afterEach(() => { globalThis.fetch = fetchOriginal })

test('fuenteDrive traduce la respuesta de Drive y manda el token', async () => {
  const urls: string[] = []
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    urls.push(url)
    assert.equal((init?.headers as any)?.authorization, 'Bearer tok')
    return new Response(JSON.stringify({
      files: [{ id: 'f1', name: 'Lista.xlsx', mimeType: 'application/pdf', modifiedTime: '2026-11-01T00:00:00Z', size: '123' }],
      nextPageToken: 'p2',
    }), { status: 200 })
  }) as any
  const p = await fuenteDrive('tok').listarPagina('carpeta1', null)
  assert.equal(p.nextPageToken, 'p2')
  assert.deepEqual(p.files[0], { id: 'f1', name: 'Lista.xlsx', mimeType: 'application/pdf', modifiedTime: '2026-11-01T00:00:00Z', md5Checksum: null, webViewLink: null, size: '123' })
  assert.match(urls[0], /supportsAllDrives=true/)
  assert.equal(new URL(urls[0]).searchParams.get('q'), "'carpeta1' in parents and trashed = false")
})

test('fuenteDrive corta si Drive no responde 200', async () => {
  globalThis.fetch = (async () => new Response('no', { status: 403 })) as any
  await assert.rejects(fuenteDrive('tok').listarPagina('c', null), /403/)
})
