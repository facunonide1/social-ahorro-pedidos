/**
 * Ninguna lista de droguería trae EAN. El match es por nombre: marca, droga,
 * concentración, presentación y unidades. El score queda guardado. Debajo del
 * umbral la fila es «sin match» y espera un mapeo a mano, que después se reusa.
 */

export type ViaMatch = 'ean' | 'codigo' | 'mapeo' | 'nombre' | 'sin_match'

export type ProductoRef = {
  id: string
  nombre: string
  sku?: string | null
  codigoBarras?: string | null
  droga?: string | null
  presentacion?: string | null
}

export type ResultadoMatch = {
  productoId: string | null
  score: number
  via: ViaMatch
  nombre: string | null
}

const STOP = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'y', 'en', 'con', 'por', 'para', 'un', 'una',
  'x', 'comp', 'compr', 'comprimidos', 'comprimido', 'caps', 'capsulas', 'cap',
  'mg', 'gr', 'g', 'ml', 'unid', 'unidad', 'unidades',
])

export function normalizarTexto(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9,.\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function concentracionDe(s: string): string | null {
  const n = normalizarTexto(s).replace(/\s+/g, '')
  const m = n.match(/(\d+(?:[.,]\d+)?)(mg|mcg|ug|g|ml|ui|%)/)
  if (!m) return null
  const num = m[1].replace(',', '.')
  const uni = m[2] === 'ug' ? 'mcg' : m[2] === 'g' && !n.includes('mg') ? 'g' : m[2]
  return `${num}${uni}`
}

export function unidadesDe(s: string): string | null {
  const n = normalizarTexto(s)
  const m = n.match(/\bx\s*(\d{1,4})\b/) ?? n.match(/\b(\d{1,4})\s*(comp|caps|unid|sobres|amp)\b/)
  return m ? m[1] : null
}

export function tokensDe(s: string): string[] {
  return normalizarTexto(s)
    .split(' ')
    .map((t) => t.replace(/[.,]/g, ''))
    .filter((t) => t.length >= 3 && !STOP.has(t) && !/^\d+$/.test(t))
}

function dice(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0
  const sb = new Set(b)
  let inter = 0
  const vistos = new Set<string>()
  for (const t of a) {
    if (vistos.has(t)) continue
    vistos.add(t)
    if (sb.has(t)) inter++
  }
  const ua = new Set(a).size
  const ub = new Set(b).size
  return (2 * inter) / (ua + ub)
}

/** 0 a 1. Concentración distinta frena el score: 5 mg no es 10 mg. */
export function scoreNombre(a: string, b: string): number {
  const ca = concentracionDe(a)
  const cb = concentracionDe(b)
  if (ca && cb && ca !== cb) return Math.min(0.35, dice(tokensDe(a), tokensDe(b)))
  let s = dice(tokensDe(a), tokensDe(b))
  const ua = unidadesDe(a)
  const ub = unidadesDe(b)
  if (ua && ub && ua === ub) s += 0.06
  if (ca && cb && ca === cb) s += 0.08
  return Math.max(0, Math.min(1, Math.round(s * 1000) / 1000))
}

export function claveNombre(nombre: string): string {
  return normalizarTexto(nombre)
}

export function matchearProducto(
  consulta: { nombre?: string | null; ean?: string | null; codigo?: string | null },
  catalogo: ProductoRef[],
  mapeos: { nombreNorm: string; productoId: string }[],
  umbral: number,
): ResultadoMatch {
  const ean = (consulta.ean ?? '').replace(/\D/g, '')
  if (ean.length >= 8) {
    const hit = catalogo.find((p) => (p.codigoBarras ?? '').replace(/\D/g, '') === ean)
    if (hit) return { productoId: hit.id, score: 1, via: 'ean', nombre: hit.nombre }
  }
  const codigo = (consulta.codigo ?? '').trim().toLowerCase()
  if (codigo) {
    const hit = catalogo.find((p) => (p.sku ?? '').trim().toLowerCase() === codigo)
    if (hit) return { productoId: hit.id, score: 1, via: 'codigo', nombre: hit.nombre }
  }
  const nombre = consulta.nombre ?? ''
  const clave = claveNombre(nombre)
  const mapa = mapeos.find((m) => m.nombreNorm === clave)
  if (mapa) {
    const hit = catalogo.find((p) => p.id === mapa.productoId)
    return { productoId: mapa.productoId, score: 1, via: 'mapeo', nombre: hit?.nombre ?? null }
  }
  let mejor: ResultadoMatch = { productoId: null, score: 0, via: 'sin_match', nombre: null }
  for (const p of catalogo) {
    const ficha = [p.nombre, p.droga, p.presentacion].filter(Boolean).join(' ')
    const s = scoreNombre(nombre, ficha)
    if (s > mejor.score) mejor = { productoId: p.id, score: s, via: 'nombre', nombre: p.nombre }
  }
  if (mejor.score < umbral) {
    return { productoId: null, score: mejor.score, via: 'sin_match', nombre: mejor.nombre }
  }
  return mejor
}

export function porcentajeMatch(scores: { via: ViaMatch }[]): number {
  if (!scores.length) return 0
  const ok = scores.filter((s) => s.via !== 'sin_match').length
  return Math.round((ok / scores.length) * 1000) / 10
}
