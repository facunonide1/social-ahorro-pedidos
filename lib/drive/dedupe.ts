/**
 * Un archivo de Drive tiene un id estable. Si aparece en dos carpetas, es el
 * mismo. Se vuelve a procesar solo cuando cambia el md5 o la fecha de
 * modificación: una lista nueva no es un duplicado de la vieja.
 */

export type Huella = { fileId: string; md5: string | null; modifiedTime: string | null }

export function esElMismoContenido(previo: Huella, nuevo: Huella): boolean {
  if (previo.fileId !== nuevo.fileId) return false
  if (previo.md5 && nuevo.md5) return previo.md5 === nuevo.md5
  return (previo.modifiedTime ?? '') === (nuevo.modifiedTime ?? '')
}
