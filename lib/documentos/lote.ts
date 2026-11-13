/**
 * LO QUE SE PUEDE MANDAR EN LA CARGA EN LOTE, ANTES DE MANDARLO.
 *
 * ── EL BUG DEL 13/11 ────────────────────────────────────────────────────────
 *
 * El `<input type="file">` hacía `const f = e.target.files; e.currentTarget
 * .value = ''; agregar(f)`. `input.files` es una FileList VIVA: vaciar el
 * input la vacía también. `agregar` recibía una lista de largo 0 y salía sin
 * hacer nada: ninguna request, ningún error, ningún log. `copiarArchivos`
 * saca una copia ANTES de limpiar el input.
 *
 * ── EL TOPE QUE NO ERA EL NUESTRO ───────────────────────────────────────────
 *
 * La subida pasa por una función de Vercel, que corta cualquier cuerpo de más
 * de 4,5 MB con un 413 antes de que llegue al código. El tope del motor es 12
 * MB (DOC_MAX_BYTES), pero un PDF o un HEIC de 6 MB nunca llegaba: las fotos
 * comunes se comprimen en el navegador, los PDF y HEIC no. Se avisa antes de
 * mandar, con el motivo, en vez de fallar mudo.
 */
import { DOC_MAX_BYTES, DOC_MIMES_ACEPTADOS } from '@/lib/documentos/config'

/** 4,5 MB de Vercel menos el margen del multipart. */
export const LIMITE_CUERPO_BYTES = 4_300_000

const mb = (b: number) => (b / (1024 * 1024)).toLocaleString('es-AR', { maximumFractionDigits: 1 })

/** Copia la lista ANTES de limpiar el input (la FileList del input es viva). */
export function copiarArchivos<T>(lista: ArrayLike<T> | null | undefined): T[] {
  return lista ? Array.from(lista) : []
}

/** ¿El navegador la va a comprimir antes de subir? (comprimir-cliente.ts) */
export function seComprime(mime: string): boolean {
  return mime.startsWith('image/') && mime !== 'image/heic' && mime !== 'image/heif'
}

/** El motivo para no mandar este archivo, o null si se puede mandar. */
export function motivoRechazo(f: { name: string; size: number; type: string }): string | null {
  const mime = (f.type || '').toLowerCase()
  if (!mime) return 'No reconozco el tipo de archivo. Mandá una foto (JPG, PNG) o un PDF.'
  if (!DOC_MIMES_ACEPTADOS.includes(mime as any)) {
    return `Ese tipo de archivo (${mime}) no se puede cargar. Mandá una foto (JPG, PNG) o un PDF.`
  }
  if (f.size === 0) return 'El archivo está vacío.'
  if (f.size > DOC_MAX_BYTES) {
    return `Pesa ${mb(f.size)} MB y el máximo es ${mb(DOC_MAX_BYTES)} MB.`
  }
  if (!seComprime(mime) && f.size > LIMITE_CUERPO_BYTES) {
    const que = mime === 'application/pdf' ? 'El PDF' : 'La foto HEIC'
    return `${que} pesa ${mb(f.size)} MB y por ahora se pueden subir hasta ${mb(LIMITE_CUERPO_BYTES)} MB por archivo. ` +
      (mime === 'application/pdf' ? 'Partilo en páginas o comprimilo.' : 'Sacala en JPG o mandala por WhatsApp para que se achique.')
  }
  return null
}

/** Después de comprimir: si igual no entra, se dice antes de mandar. */
export function motivoTrasComprimir(size: number): string | null {
  return size > LIMITE_CUERPO_BYTES
    ? `Aun comprimida pesa ${mb(size)} MB y se pueden subir hasta ${mb(LIMITE_CUERPO_BYTES)} MB por archivo. Sacala con menos resolución.`
    : null
}
