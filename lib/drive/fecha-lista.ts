/**
 * La fecha de una lista de precios. Antes se perdía: solo dos formatos la
 * traían, y aun así `resolverLista` no se la pasaba a `aplicarLista`, que
 * fechaba todo con el día de la carga. Una lista vieja subida hoy pisaba a
 * una nueva.
 *
 * Orden: el nombre del archivo, después la carpeta, y si no hay, la fecha de
 * modificación en Drive. Siempre se dice de dónde salió (`fuente`), para que
 * una fecha supuesta no se lea como dato.
 */

export type FechaDeLista = { fecha: string; fuente: 'nombre' | 'ruta' | 'contenido' | 'modificado' }

const MESES: Record<string, number> = {
  ene: 1, enero: 1, feb: 2, febrero: 2, mar: 3, marzo: 3, abr: 4, abril: 4, may: 5, mayo: 5,
  jun: 6, junio: 6, jul: 7, julio: 7, ago: 8, agosto: 8, sep: 9, sept: 9, set: 9, septiembre: 9, setiembre: 9,
  oct: 10, octubre: 10, nov: 11, noviembre: 11, dic: 12, diciembre: 12,
}

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function anioCompleto(a: number): number {
  return a < 100 ? 2000 + a : a
}

function valida(y: number, m: number, d: number): string | null {
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null
  const f = new Date(Date.UTC(y, m - 1, d))
  if (f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return null
  return f.toISOString().slice(0, 10)
}

/** Una fecha escrita en un texto (nombre de archivo o carpeta), o null. Formato argentino: día antes que mes. */
export function fechaEnTexto(texto: string): string | null {
  const t = norm(texto)
  let m = t.match(/(20\d{2})[-_.\s](\d{1,2})[-_.\s](\d{1,2})(?!\d)/)
  if (m) return valida(+m[1], +m[2], +m[3])
  m = t.match(/(?<!\d)(\d{1,2})[-_.\s/](\d{1,2})[-_.\s/](\d{2}|\d{4})(?!\d)/)
  if (m) return valida(anioCompleto(+m[3]), +m[2], +m[1])
  m = t.match(/(?<!\d)(20\d{2})(\d{2})(\d{2})(?!\d)/)
  if (m) return valida(+m[1], +m[2], +m[3])
  m = t.match(/(?<![a-z])([a-z]{3,10})[-_.\s]*(?:de[-_.\s]+)?(20\d{2}|\d{2})(?!\d)/)
  if (m && MESES[m[1]]) return valida(anioCompleto(+m[2]), MESES[m[1]], 1)
  m = t.match(/(?<!\d)(\d{1,2})[-_.](20\d{2})(?!\d)/)
  if (m) return valida(+m[2], +m[1], 1)
  return null
}

export function fechaDeLista(s: {
  nombre: string
  ruta?: string | null
  vigenteDesde?: string | null
  modifiedTime?: string | null
  ahora: Date
}): FechaDeLista | null {
  // Una fecha más de 7 días en el futuro es un error de lectura, no una lista.
  const tope = new Date(s.ahora.getTime() + 7 * 86_400_000).toISOString().slice(0, 10)
  const ok = (f: string | null) => (f && f <= tope ? f : null)
  const delNombre = ok(fechaEnTexto(s.nombre.replace(/\.[a-z0-9]+$/i, '')))
  if (delNombre) return { fecha: delNombre, fuente: 'nombre' }
  const segs = (s.ruta ?? '').split('/').slice(0, -1).reverse()
  for (const seg of segs) {
    const f = ok(fechaEnTexto(seg))
    if (f) return { fecha: f, fuente: 'ruta' }
  }
  const delContenido = ok(s.vigenteDesde ? s.vigenteDesde.slice(0, 10) : null)
  if (delContenido) return { fecha: delContenido, fuente: 'contenido' }
  if (s.modifiedTime) return { fecha: s.modifiedTime.slice(0, 10), fuente: 'modificado' }
  return null
}
