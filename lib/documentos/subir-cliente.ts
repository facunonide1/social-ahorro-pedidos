import { comprimirSiHaceFalta } from '@/lib/documentos/comprimir-cliente'

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
export async function subirDocumentoCliente(file: File): Promise<SubidaCliente> {
  try {
    const listo = await comprimirSiHaceFalta(file)
    const fd = new FormData()
    fd.append('archivo', listo)

    const r = await fetch('/api/documentos/subir', { method: 'POST', body: fd })
    const j = await r.json().catch(() => null)

    if (!r.ok) {
      return { estado: 'error', mensaje: j?.error ?? 'No pude subir el archivo. Probá de nuevo.' }
    }
    return j as SubidaCliente
  } catch {
    return { estado: 'error', mensaje: 'No pude subir el archivo. Revisá la conexión y probá de nuevo.' }
  }
}
