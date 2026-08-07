import { createHash } from 'crypto'

import {
  DOC_BUCKET,
  DOC_MAX_BYTES,
  DOC_MIMES_ACEPTADOS,
  TENANT_ACTUAL,
} from '@/lib/documentos/config'

type Adm = any

export type ResultadoSubida =
  | {
      estado: 'duplicado'
      /** La extracción que ya existía con este mismo archivo. */
      extraccionId: string
      documentoId: string | null
      /** Para que la UI ofrezca abrirlo en vez de reprocesar. */
      mensaje: string
    }
  | {
      estado: 'subido'
      extraccionId: string
      archivoPath: string
      archivoHash: string
      mimeType: string
    }
  | { estado: 'error'; mensaje: string }

/** SHA-256 del contenido. Se calcula ANTES de subir, para no pagar el storage. */
export function hashArchivo(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex')
}

/** tenant/{tenant}/{año}/{mes}/{uuid}.{ext} */
function rutaArchivo(nombre: string, mime: string): string {
  const ahora = new Date()
  const anio = ahora.getFullYear()
  const mes = String(ahora.getMonth() + 1).padStart(2, '0')
  const ext =
    (nombre.includes('.') ? nombre.split('.').pop()!.toLowerCase().replace(/[^a-z0-9]/g, '') : '') ||
    (mime === 'application/pdf' ? 'pdf' : mime.split('/')[1] ?? 'bin')
  return `tenant/${TENANT_ACTUAL}/${anio}/${mes}/${crypto.randomUUID()}.${ext}`
}

/**
 * Sube un documento comercial y registra su extracción — SIN llamar a ningún
 * modelo todavía.
 *
 * Es el único camino de subida del motor: lo usan la carga desde Finanzas, el
 * clip del asistente y (más adelante) la recepción de remitos en Compras. Si
 * aparece una cuarta puerta, llama acá; no se duplica esta lógica.
 *
 * El hash se calcula antes de subir: si ya se cargó ese archivo, no se vuelve a
 * guardar ni se vuelve a leer con el modelo. Eso ahorra plata de modelo y, más
 * importante, evita que la misma factura entre dos veces.
 */
export async function subirDocumento(
  adm: Adm,
  archivo: { buffer: Buffer; nombre: string; mime: string },
  userId: string | null,
): Promise<ResultadoSubida> {
  const mime = (archivo.mime || '').toLowerCase()
  if (!DOC_MIMES_ACEPTADOS.includes(mime as any)) {
    return { estado: 'error', mensaje: 'Ese tipo de archivo no se puede cargar. Mandá una foto (JPG, PNG) o un PDF.' }
  }
  if (!archivo.buffer.length) {
    return { estado: 'error', mensaje: 'El archivo llegó vacío. Probá de nuevo.' }
  }
  if (archivo.buffer.length > DOC_MAX_BYTES) {
    const mb = Math.round(DOC_MAX_BYTES / (1024 * 1024))
    return { estado: 'error', mensaje: `El archivo es muy grande (máximo ${mb} MB). Sacá la foto de nuevo con menos resolución.` }
  }

  const hash = hashArchivo(archivo.buffer)

  // Anti-duplicado por imagen: mismo archivo = mismo documento.
  const { data: ya } = await adm
    .from('doc_extracciones')
    .select('id, documento_id')
    .eq('tenant_id', TENANT_ACTUAL)
    .eq('archivo_hash', hash)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (ya) {
    return {
      estado: 'duplicado',
      extraccionId: ya.id,
      documentoId: ya.documento_id ?? null,
      mensaje: 'Esta foto ya se cargó antes. Te abro el documento que salió de ella.',
    }
  }

  const path = rutaArchivo(archivo.nombre, mime)
  const { error: eUp } = await adm.storage
    .from(DOC_BUCKET)
    .upload(path, archivo.buffer, { contentType: mime, upsert: false })

  if (eUp) {
    console.error('[documentos] fallo al subir al bucket', eUp)
    return { estado: 'error', mensaje: 'No pude guardar el archivo. Probá de nuevo en un momento.' }
  }

  const { data: ext, error: eIns } = await adm
    .from('doc_extracciones')
    .insert({
      archivo_path: path,
      archivo_hash: hash,
      mime_type: mime,
      estado: 'pendiente',
      created_by: userId,
    })
    .select('id')
    .single()

  if (eIns) {
    // El archivo quedó arriba sin fila: se limpia para no dejar basura huérfana.
    await adm.storage.from(DOC_BUCKET).remove([path]).catch(() => {})
    console.error('[documentos] fallo al registrar la extracción', eIns)
    return { estado: 'error', mensaje: 'No pude registrar el documento. Probá de nuevo en un momento.' }
  }

  return { estado: 'subido', extraccionId: ext.id, archivoPath: path, archivoHash: hash, mimeType: mime }
}

/** URL firmada para mostrar el original. El bucket es privado. */
export async function urlFirmada(adm: Adm, path: string, segundos = 3600): Promise<string | null> {
  const { data } = await adm.storage.from(DOC_BUCKET).createSignedUrl(path, segundos)
  return data?.signedUrl ?? null
}
