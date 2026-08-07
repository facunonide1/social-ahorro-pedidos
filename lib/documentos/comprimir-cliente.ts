import { DOC_COMPRIMIR_DESDE_BYTES, DOC_LADO_MAX_PX } from '@/lib/documentos/config'

/**
 * Comprime una imagen en el navegador antes de subirla.
 *
 * Una foto de celular moderno pesa 8–15 MB y no aporta nada por encima de
 * ~2200px de lado: el renglón de una factura ya se lee. Bajarla acá ahorra
 * datos móviles en la sucursal y tiempo de subida.
 *
 * Si no es imagen, si ya es chica, o si el navegador no puede procesarla,
 * devuelve el archivo original sin tocar — nunca falla la subida por esto.
 */
export async function comprimirSiHaceFalta(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file
  if (file.size <= DOC_COMPRIMIR_DESDE_BYTES) return file
  // HEIC no lo decodifica el canvas en la mayoría de los navegadores.
  if (file.type === 'image/heic' || file.type === 'image/heif') return file

  try {
    const bitmap = await createImageBitmap(file)
    const escala = Math.min(1, DOC_LADO_MAX_PX / Math.max(bitmap.width, bitmap.height))
    if (escala >= 1 && file.size <= DOC_COMPRIMIR_DESDE_BYTES) return file

    const w = Math.round(bitmap.width * escala)
    const h = Math.round(bitmap.height * escala)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close?.()

    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.85))
    if (!blob || blob.size >= file.size) return file

    const base = file.name.replace(/\.[^.]+$/, '')
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg' })
  } catch {
    return file
  }
}
