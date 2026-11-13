/**
 * LA FECHA DE UNA LISTA DE PRECIOS.
 *
 * Antes cada ítem y cada evento del historial se guardaban con la fecha del día
 * de la ingesta: una lista de octubre que entraba hoy quedaba como de hoy, y
 * pisaba a la vigente aunque fuera más vieja. Ahora la fecha sale, en este
 * orden, de:
 *   1. lo que dice la lista (el `vigenteDesde` que lee el parser),
 *   2. el nombre del archivo («Lista Monroe 12-11-26.xlsx», «Norma nov 2026»),
 *   3. la fecha de modificación en Drive,
 *   4. y si no hay nada, hoy.
 * Se guarda de dónde salió, para poder decirlo en pantalla.
 */

export type FuenteFecha = 'contenido' | 'nombre' | 'drive' | 'hoy'

const MESES: Record<string, number> = {
  ene: 1, enero: 1, feb: 2, febrero: 2, mar: 3, marzo: 3, abr: 4, abril: 4, may: 5, mayo: 5,
  jun: 6, junio: 6, jul: 7, julio: 7, ago: 8, agosto: 8, sep: 9, sept: 9, set: 9, septiembre: 9, setiembre: 9,
  oct: 10, octubre: 10, nov: 11, noviembre: 11, dic: 12, diciembre: 12,
}

function iso(a: number, m: number, d: number): string | null {
  if (a < 100) a += 2000
  if (a < 2015 || a > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null
  const f = new Date(Date.UTC(a, m - 1, d))
  if (f.getUTCMonth() !== m - 1) return null // 31/02
  return f.toISOString().slice(0, 10)
}

/** Una fecha escrita a mano en un texto (dd/mm/aa, aaaa-mm-dd, «12 de noviembre de 2026», «nov 2026»). */
export function parsearFechaTexto(texto: string | null | undefined): string | null {
  if (!texto) return null
  const t = texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  let m = t.match(/(?<!\d)(\d{4})[-_.](\d{1,2})[-_.](\d{1,2})(?!\d)/)
  if (m) return iso(+m[1], +m[2], +m[3])
  m = t.match(/(?<!\d)(\d{1,2})[-/_.](\d{1,2})[-/_.](\d{2}|\d{4})(?!\d)/)
  if (m) return iso(+m[3], +m[2], +m[1])
  m = t.match(/(?<!\d)(\d{1,2})\s+de\s+([a-z]+)\s+(?:de\s+)?(\d{4})/)
  if (m && MESES[m[2]]) return iso(+m[3], MESES[m[2]], +m[1])
  m = t.match(/(?<![a-z])([a-z]{3,10})[\s\-_.]*(\d{4}|\d{2})(?!\d)/)
  if (m && MESES[m[1]]) return iso(+m[2], MESES[m[1]], 1)
  return null
}

export function fechaDeLista(s: {
  vigenteDesde?: string | null
  nombreArchivo?: string | null
  modifiedTime?: string | null
  hoy?: Date
}): { fecha: string; de: FuenteFecha } {
  const c = parsearFechaTexto(s.vigenteDesde)
  if (c) return { fecha: c, de: 'contenido' }
  const n = parsearFechaTexto(s.nombreArchivo)
  if (n) return { fecha: n, de: 'nombre' }
  if (s.modifiedTime && !Number.isNaN(Date.parse(s.modifiedTime))) {
    return { fecha: new Date(s.modifiedTime).toISOString().slice(0, 10), de: 'drive' }
  }
  return { fecha: (s.hoy ?? new Date()).toISOString().slice(0, 10), de: 'hoy' }
}

/** ¿La lista nueva es más vieja que la vigente? Entonces no la reemplaza. */
export function esMasVieja(nueva: string, vigente: string | null | undefined): boolean {
  return !!vigente && nueva < vigente
}
