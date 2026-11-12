import type { FuenteArchivos } from '@/lib/ingesta/fuente'
import { descargar, listarPagina } from './google'

/** Google Drive como fuente de la ingesta, con un access token ya refrescado. */
export function fuenteDrive(accessToken: string): FuenteArchivos {
  return {
    nombre: 'drive',
    async listarPagina(carpetaId, pageToken) {
      const p = await listarPagina(accessToken, carpetaId, pageToken)
      return {
        files: p.files.map((f) => ({
          id: f.id, name: f.name, mimeType: f.mimeType,
          modifiedTime: f.modifiedTime ?? null, md5Checksum: f.md5Checksum ?? null,
          webViewLink: f.webViewLink ?? null, size: f.size ?? null,
        })),
        nextPageToken: p.nextPageToken,
      }
    },
    descargar(archivo) {
      return descargar(accessToken, { id: archivo.id, mimeType: archivo.mime })
    },
  }
}
