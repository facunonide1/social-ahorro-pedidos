/**
 * DE DÓNDE VIENEN LOS ARCHIVOS QUE INGIERE NORA.
 *
 * Hoy la fuente es Google Drive. A futuro, FIND va a ser la fuente maestra.
 * Todo lo que hace la ingesta con los archivos (clasificar, parsear, cruzar,
 * guardar en la base) no depende de dónde vinieron; lo único que cambia es
 * cómo se listan y cómo se bajan. Eso es lo que define esta interfaz: cambiar
 * de fuente es escribir otra implementación, no reescribir la ingesta.
 *
 * La autenticación queda afuera: cada fuente se construye ya autenticada
 * (Drive con su access token; FIND con lo que pida cuando exista).
 */
import type { PaginaDrive } from '@/lib/drive/recorrer'

/** Un archivo o carpeta tal como lo lista una fuente. */
export type NodoFuente = PaginaDrive['files'][number]

export interface FuenteArchivos {
  /** Nombre corto, para logs y la pantalla: 'drive', 'find'. */
  readonly nombre: string
  /** Una página del contenido de una carpeta. `pageToken` null = la primera. */
  listarPagina(carpetaId: string, pageToken: string | null): Promise<PaginaDrive>
  /** El contenido de un archivo. */
  descargar(archivo: { id: string; mime: string }): Promise<Buffer>
}
