import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'

import { copiarArchivos, LIMITE_CUERPO_BYTES, motivoRechazo, motivoTrasComprimir } from './lote'
import { subirDocumentoCliente } from './subir-cliente'

/**
 * Una FileList viva como la del <input>: limpiar el input la deja en cero.
 * Es exactamente lo que pasaba en la carga en lote.
 */
function listaViva(files: File[]) {
  const lista: any = { length: files.length }
  files.forEach((f, i) => { lista[i] = f })
  const input = {
    files: lista,
    set value(_v: string) { for (let i = 0; i < files.length; i++) delete lista[i]; lista.length = 0 },
  }
  return input
}

const archivo = (nombre: string, tipo: string, bytes: number) => new File([new Uint8Array(bytes)], nombre, { type: tipo })

test('el bug: leer la FileList después de limpiar el input la da vacía; copiarla antes, no', () => {
  const a = archivo('factura.pdf', 'application/pdf', 10), b = archivo('foto.jpg', 'image/jpeg', 10)

  const mal = listaViva([a, b])
  const ref = mal.files
  mal.value = ''
  assert.equal(copiarArchivos<File>(ref).length, 0) // lo que hacía el código viejo

  const bien = listaViva([a, b])
  const copia = copiarArchivos<File>(bien.files)
  bien.value = ''
  assert.deepEqual(copia.map((f) => f.name), ['factura.pdf', 'foto.jpg'])
  assert.deepEqual(copiarArchivos(null), [])
})

test('motivoRechazo: tipo, vacío y el tope de 4,5 MB de Vercel para lo que no se comprime', () => {
  assert.equal(motivoRechazo({ name: 'f.pdf', size: 1_000_000, type: 'application/pdf' }), null)
  assert.equal(motivoRechazo({ name: 'f.jpg', size: 9_000_000, type: 'image/jpeg' }), null) // se comprime
  assert.match(motivoRechazo({ name: 'f.pdf', size: LIMITE_CUERPO_BYTES + 1, type: 'application/pdf' }) ?? '', /PDF pesa/)
  assert.match(motivoRechazo({ name: 'f.heic', size: 6_000_000, type: 'image/heic' }) ?? '', /HEIC/)
  assert.match(motivoRechazo({ name: 'f.docx', size: 10, type: 'application/msword' }) ?? '', /no se puede cargar/)
  assert.match(motivoRechazo({ name: 'f', size: 10, type: '' }) ?? '', /No reconozco/)
  assert.match(motivoRechazo({ name: 'f.pdf', size: 0, type: 'application/pdf' }) ?? '', /vacío/)
  assert.match(motivoRechazo({ name: 'f.jpg', size: 13 * 1024 * 1024, type: 'image/jpeg' }) ?? '', /máximo/)
  assert.equal(motivoTrasComprimir(1_000_000), null)
  assert.match(motivoTrasComprimir(LIMITE_CUERPO_BYTES + 1) ?? '', /Aun comprimida/)
})

const fetchOriginal = globalThis.fetch
afterEach(() => { globalThis.fetch = fetchOriginal })

test('subirDocumentoCliente: lo que no va a entrar no se manda, y se dice por qué', async () => {
  let llamadas = 0
  globalThis.fetch = (async () => { llamadas++; return new Response('{}') }) as any
  const r = await subirDocumentoCliente(archivo('grande.pdf', 'application/pdf', LIMITE_CUERPO_BYTES + 10))
  assert.equal(r.estado, 'error')
  assert.equal(llamadas, 0)
})

test('subirDocumentoCliente: un PDF normal se manda al endpoint con el lote', async () => {
  let cuerpo: FormData | null = null
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    cuerpo = init.body as FormData
    return new Response(JSON.stringify({ estado: 'subido', extraccionId: 'x', archivoPath: 'p', archivoHash: 'h', mimeType: 'application/pdf' }))
  }) as any
  const r = await subirDocumentoCliente(archivo('f.pdf', 'application/pdf', 100), 'lote-1')
  assert.equal(r.estado, 'subido')
  assert.equal((cuerpo as any)?.get('lote_id'), 'lote-1')
})

test('subirDocumentoCliente: un 413 del gateway y un error de red llegan como mensaje', async () => {
  globalThis.fetch = (async () => new Response('Request Entity Too Large', { status: 413 })) as any
  const r1 = await subirDocumentoCliente(archivo('f.pdf', 'application/pdf', 100))
  assert.ok(r1.estado === 'error' && /demasiado grande/.test(r1.mensaje))
  globalThis.fetch = (async () => { throw new TypeError('Failed to fetch') }) as any
  const r2 = await subirDocumentoCliente(archivo('f.pdf', 'application/pdf', 100))
  assert.ok(r2.estado === 'error' && /conexión/.test(r2.mensaje))
})
