/**
 * Qué es un archivo antes de bajarlo del todo, y después de mirarle la
 * cabecera. Función pura: los tests le pasan el nombre, la ruta y unas
 * señales. No habla con Drive.
 *
 * La ruta de la subcarpeta pesa. «facturas», «listas» y «maestro» no son un
 * adorno: en esta cuenta el dueño ordenó así. Un jpeg en listas es un folleto;
 * el mismo jpeg en facturas es una foto de comprobante.
 */

export type Clasificacion =
  | 'maestro'
  | 'precios'
  | 'factura'
  | 'planilla'
  | 'sin_clasificar'
  | 'ignorar'

export type Senales = {
  nombre: string
  mime: string
  ruta?: string | null
  hojas?: string[]
  /** Primeras celdas, para el banner *** dd/mm/aa *** y pla_3d. */
  celdas?: string[]
  encabezados?: string[]
  /**
   * Las primeras filas. Las listas de droguería traen título, fecha y datos
   * del proveedor antes del encabezado: mirar solo la fila 1 las mandaba a
   * «sin clasificar».
   */
  filas?: string[][]
}

/**
 * Las carpetas de compras (la del dueño y la privada) traen listas de precios
 * por droguería en subcarpetas. Una planilla o un PDF ahí es una lista,
 * aunque la ruta no diga «lista».
 */
function enCarpetaDeCompras(segs: string[]): boolean {
  return segs.some((x) => /compras\s+farmacias/.test(x))
}

const MIME_PLANILLA = new Set([
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.google-apps.spreadsheet',
  'text/csv',
])

const MIME_IMAGEN = /^image\//

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function segmentos(ruta: string | null | undefined): string[] {
  return (ruta ?? '').split(/[\\/]/).map((p) => norm(p.trim())).filter(Boolean)
}

export function esPlanilla(mime: string, nombre: string): boolean {
  if (MIME_PLANILLA.has(mime)) return true
  return /\.(xls|xlsx|csv)$/i.test(nombre)
}

export function esImagen(mime: string, nombre: string): boolean {
  if (MIME_IMAGEN.test(mime)) return true
  return /\.(jpe?g|png|webp|heic|gif)$/i.test(nombre)
}

export function esPdf(mime: string, nombre: string): boolean {
  return mime === 'application/pdf' || /\.pdf$/i.test(nombre)
}

function tieneBannerMaestro(celdas: string[]): boolean {
  return celdas.some((c) => /\*{2,}\s*\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}/.test(c))
}

function hojaMaestro(hojas: string[]): boolean {
  return hojas.some((h) => norm(h).includes('pla_3d'))
}

export function clasificar(s: Senales): Clasificacion {
  const nombre = norm(s.nombre)
  const segs = segmentos(s.ruta)
  const en = (p: string) => segs.some((x) => x.includes(p)) || nombre.includes(p)
  const planilla = esPlanilla(s.mime, s.nombre)
  const imagen = esImagen(s.mime, s.nombre)
  const pdf = esPdf(s.mime, s.nombre)

  if (/importacion temporal/.test(nombre)) return 'ignorar'

  if (/compras y precios por droguer/.test(nombre)) return 'planilla'

  if (planilla && (hojaMaestro(s.hojas ?? []) || tieneBannerMaestro(s.celdas ?? []))) {
    return 'maestro'
  }

  const enMaestros = en('maestro') || en('ventas') || en('stock')
  if (planilla && (enMaestros || /\bmaestro\b/.test(nombre))) return 'maestro'

  // Folletos sin precios: no son una lista y no son una factura.
  if (/irma|saint gotard|vitamin\s*way|folleto/.test(nombre) && !en('factura')) {
    return 'sin_clasificar'
  }

  if (en('factura') && (pdf || imagen || /factura/.test(nombre))) return 'factura'
  if ((pdf || imagen) && en('factura')) return 'factura'

  if (enCarpetaDeCompras(segs) && !en('factura')) {
    if (planilla || pdf) return 'precios'
    // Una foto en la carpeta de listas es un folleto, no una factura.
    if (imagen) return 'sin_clasificar'
  }

  if (en('lista') && imagen) return 'sin_clasificar'
  if (en('lista') && (planilla || pdf)) return 'precios'
  if (pdf && /lista|precio/.test(nombre)) return 'precios'

  if (planilla && (pareceLista(s.encabezados ?? []) || (s.filas ?? []).some((f) => pareceLista(f)))) return 'precios'
  if (/factura/.test(nombre)) return 'factura'
  if (pdf || imagen) return en('lista') ? 'sin_clasificar' : 'factura'

  return 'sin_clasificar'
}

function pareceLista(encabezados: string[]): boolean {
  const h = encabezados.map(norm)
  const precio = h.some((x) => /precio|pvp|costo/.test(x))
  const nombre = h.some((x) => /descripcion|producto|articulo|item/.test(x))
  return precio && nombre
}
