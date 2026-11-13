/**
 * Lo que la carga en lote hace con los archivos ANTES de subirlos. Puro, sin
 * navegador: se prueba con `node --test`.
 *
 * EL BUG QUE ARREGLA (12/11/2026, «elijo facturas y no se cargan»): el
 * `onChange` del input hacía
 *     const f = e.target.files; e.currentTarget.value = ''; if (f) agregar(f)
 * y `input.files` es una lista VIVA: al vaciar el valor del input (para poder
 * volver a elegir el mismo archivo) el navegador la deja en cero. `agregar`
 * recibía una lista vacía y salía en silencio: ni request, ni error, ni log.
 * Arrastrar y soltar sí andaba porque `dataTransfer.files` no se vacía así.
 *
 * La regla: copiar a un array PRIMERO, vaciar el input DESPUÉS.
 */

/** Lo mínimo de un archivo que hace falta acá (File lo cumple). */
export type ArchivoLike = { name: string; size: number; type: string }

/** Copia la lista (viva o no) a un array propio. Llamar antes de tocar el input. */
export function copiarArchivos<T>(lista: ArrayLike<T> | null | undefined): T[] {
  return lista ? Array.from(lista) : []
}

/**
 * Vercel corta antes de la función todo pedido de más de 4,5 MB (413
 * FUNCTION_PAYLOAD_TOO_LARGE): no llega a los logs de la app. Se deja margen
 * para el resto del formulario.
 */
export const LIMITE_SUBIDA_BYTES = Math.floor(4.4 * 1024 * 1024)

function mb(bytes: number): string {
  return (bytes / (1024 * 1024)).toLocaleString('es-AR', { maximumFractionDigits: 1 })
}

/** Por qué este archivo (ya comprimido si correspondía) no se puede subir, o null si se puede. */
export function motivoParaNoSubir(f: ArchivoLike, maxBytes = LIMITE_SUBIDA_BYTES): string | null {
  if (f.size === 0) return 'El archivo está vacío.'
  if (f.size > maxBytes) {
    const tipo = f.type === 'application/pdf' ? 'Este PDF' : 'Este archivo'
    return `${tipo} pesa ${mb(f.size)} MB y el máximo es ${mb(maxBytes)} MB. Achicalo (o sacale una foto a la factura) y probá de nuevo.`
  }
  return null
}

/** Mensaje para una respuesta del servidor que no es JSON (p. ej. el 413 de Vercel). */
export function mensajeDeEstado(status: number): string {
  if (status === 413) return 'El archivo es demasiado grande para subirlo. Achicalo y probá de nuevo.'
  if (status === 401 || status === 403) return 'Tu sesión venció o no tenés permiso. Entrá de nuevo.'
  if (status >= 500) return 'El servidor no pudo guardarlo. Probá de nuevo en un rato.'
  return 'No pude subir el archivo. Probá de nuevo.'
}
