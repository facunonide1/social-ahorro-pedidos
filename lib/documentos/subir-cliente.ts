import { comprimirSiHaceFalta } from '@/lib/documentos/comprimir-cliente'
import { motivoRechazo, motivoTrasComprimir } from '@/lib/documentos/lote'

export type SubidaCliente =
  | { estado: 'subido'; extraccionId: string; archivoPath: string; archivoHash: string; mimeType: string }
  | { estado: 'duplicado'; extraccionId: string; documentoId: string | null; mensaje: string }
  | { estado: 'error'; mensaje: string }

/**
 * Sube un documento desde el navegador. Comprime si hace falta, postea al
 * único endpoint de subida y normaliza la respuesta.
 *
 * Es lo que llaman las tres puertas de entrada (alta de Finanzas, clip del
 * asistente, y más adelante recepción de remitos) para no repetir el fetch,
 * el manejo de error ni la compresión en cada pantalla.
 */
export async function subirDocumentoCliente(file: File, loteId?: string): Promise<SubidaCliente> {
  // Lo que no va a llegar, no se manda: se dice por qué, en la fila.
  const antes = motivoRechazo(file)
  if (antes) return { estado: 'error', mensaje: antes }
  try {
    const listo = await comprimirSiHaceFalta(file)
    const despues = motivoTrasComprimir(listo.size)
    if (despues) return { estado: 'error', mensaje: despues }
    const fd = new FormData()
    fd.append('archivo', listo)
    if (loteId) fd.append('lote_id', loteId)

    const r = await fetch('/api/documentos/subir', { method: 'POST', body: fd })
    const j = await r.json().catch(() => null)

    if (!r.ok) {
      if (r.status === 413) return { estado: 'error', mensaje: 'El archivo es demasiado grande para subirlo por acá.' }
      if (r.status === 401 || r.status === 403) return { estado: 'error', mensaje: j?.error ?? 'Tu usuario no puede cargar documentos.' }
      return { estado: 'error', mensaje: j?.error ?? `No pude subir el archivo (error ${r.status}). Probá de nuevo.` }
    }
    return j as SubidaCliente
  } catch {
    return { estado: 'error', mensaje: 'No pude subir el archivo. Revisá la conexión y probá de nuevo.' }
  }
}
