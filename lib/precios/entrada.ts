/**
 * EL COMPARADOR DE PRECIOS · lo que entra.
 *
 * Grok Bot ya lee los precios de las webs de las droguerías. Esto define cómo
 * llegan a NORA: por el endpoint con clave propia, o desde una hoja de Google
 * Sheets. Las dos fuentes terminan en el mismo formato de fila y en la misma
 * función de la base, que reconoce proveedor y producto y aplica las reglas de
 * plausibilidad. Esas reglas viven en SQL, una sola vez.
 *
 * Acá solo se valida la forma. Lo que no se puede leer sin adivinar (un precio
 * «3.210», que puede ser tres mil o tres con veintiuno) queda null, y la base
 * lo rechaza diciendo por qué.
 */
import { timingSafeEqual } from 'crypto'
import { z } from 'zod'

export const FUENTES = ['grok_bot', 'sheets'] as const
export type Fuente = (typeof FUENTES)[number]

export const MAX_FILAS = 5000

export interface FilaDePrecio {
  proveedor: string
  cuit: string | null
  codigo_barras: string | null
  sku_proveedor: string | null
  descripcion: string | null
  /** Null si no se pudo leer sin adivinar. La base rechaza la fila con el motivo. */
  precio: number | null
  /** ISO 8601, como vino. La base decide si es del futuro o demasiado vieja. */
  capturado_at: string | null
}

export type LecturaDeIngesta =
  | { ok: true; fuente: Fuente; filas: FilaDePrecio[]; descartadas: { indice: number; motivo: string }[] }
  | { ok: false; error: string }

const filaCruda = z.object({
  proveedor: z.string().trim().min(1).optional(),
  cuit: z.string().trim().optional(),
  codigo_barras: z.union([z.string(), z.number()]).optional(),
  sku: z.string().trim().optional(),
  sku_proveedor: z.string().trim().optional(),
  descripcion: z.string().trim().optional(),
  precio: z.union([z.number(), z.string()]).optional(),
  capturado_at: z.string().trim().optional(),
}).passthrough()

const cuerpo = z.object({
  fuente: z.enum(FUENTES),
  filas: z.array(z.unknown()).max(MAX_FILAS),
})

/**
 * Un precio como lo escribe una web argentina: `3210.5`, `3.210,50`, `$ 3210`.
 * Si es ambiguo (`3.210` sin decimales), null: no se adivina.
 */
export function leerPrecio(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string') return null
  const t = v.replace(/[$\s]/g, '')
  if (!t) return null
  let n: string
  if (/^\d{1,3}(\.\d{3})+,\d+$/.test(t)) n = t.replace(/\./g, '').replace(',', '.')   // 3.210,50
  else if (/^\d+,\d+$/.test(t)) n = t.replace(',', '.')                              // 3210,50
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) return null                                // 3.210: ambiguo
  else if (/^\d+(\.\d+)?$/.test(t)) n = t                                            // 3210.5
  else return null
  const x = Number(n)
  return Number.isFinite(x) ? x : null
}

const soloDigitos = (s: string | undefined) => {
  const d = (s ?? '').replace(/\D/g, '')
  return d || null
}

export function leerIngesta(body: unknown): LecturaDeIngesta {
  const c = cuerpo.safeParse(body)
  if (!c.success) {
    return { ok: false, error: `el cuerpo no tiene la forma esperada: { fuente: ${FUENTES.join(' | ')}, filas: [...] } (máximo ${MAX_FILAS} filas)` }
  }
  const filas: FilaDePrecio[] = []
  const descartadas: { indice: number; motivo: string }[] = []
  c.data.filas.forEach((cruda, indice) => {
    const f = filaCruda.safeParse(cruda)
    if (!f.success) { descartadas.push({ indice, motivo: 'la fila no es un objeto con los campos esperados' }); return }
    const x = f.data
    const codigo = x.codigo_barras == null ? null : soloDigitos(String(x.codigo_barras))
    const sku = x.sku_proveedor ?? x.sku ?? null
    // El producto se reconoce por código de barras. El sku del proveedor se guarda, pero no alcanza:
    // no hay una tabla que diga qué sku de cada droguería es qué producto.
    if (!codigo) { descartadas.push({ indice, motivo: 'no tiene código de barras: no hay con qué reconocer el producto (el sku solo no alcanza)' }); return }
    if (!x.proveedor && !x.cuit) { descartadas.push({ indice, motivo: 'no dice de qué proveedor es' }); return }
    filas.push({
      proveedor: x.proveedor ?? '',
      cuit: soloDigitos(x.cuit),
      codigo_barras: codigo,
      sku_proveedor: sku,
      descripcion: x.descripcion ?? null,
      precio: leerPrecio(x.precio),
      capturado_at: x.capturado_at ?? null,
    })
  })
  return { ok: true, fuente: c.data.fuente, filas, descartadas }
}

/** Comparación en tiempo constante. Sin clave configurada, nadie entra. */
export function claveValida(recibida: string | null | undefined, configurada: string | undefined): boolean {
  if (!configurada || !recibida) return false
  const a = Buffer.from(recibida)
  const b = Buffer.from(configurada)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/* ── Google Sheets ───────────────────────────────────────────────────────── */

/**
 * La URL de exportación a CSV de una hoja compartida por link. Solo
 * `https://docs.google.com/spreadsheets/d/<id>`: cualquier otra cosa es null,
 * para que el servidor no se convierta en un cliente HTTP de lo que le manden.
 */
export function urlDeExportacion(url: string): string | null {
  let u: URL
  try { u = new URL(url) } catch { return null }
  if (u.protocol !== 'https:' || u.hostname !== 'docs.google.com') return null
  const m = u.pathname.match(/^\/spreadsheets\/d\/([A-Za-z0-9_-]{10,})/)
  if (!m) return null
  const gid = (u.hash.match(/gid=(\d+)/) ?? u.search.match(/gid=(\d+)/))?.[1] ?? '0'
  return `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv&gid=${gid}`
}

/** CSV con comillas dobles (RFC 4180): comas y saltos de línea dentro de comillas. */
function filasCsv(texto: string): string[][] {
  const out: string[][] = []
  let fila: string[] = [], campo = '', comillas = false
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (comillas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++ }
      else if (c === '"') comillas = false
      else campo += c
    } else if (c === '"') comillas = true
    else if (c === ',') { fila.push(campo); campo = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++
      fila.push(campo); campo = ''
      if (fila.some((x) => x.trim())) out.push(fila)
      fila = []
    } else campo += c
  }
  if (campo || fila.length) { fila.push(campo); if (fila.some((x) => x.trim())) out.push(fila) }
  return out
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '')

/** Qué encabezado es qué. Se busca por nombre, no por posición. */
const COLUMNAS: Record<keyof Omit<FilaDePrecio, 'precio'> | 'precio', string[]> = {
  proveedor: ['proveedor', 'drogueria', 'distribuidor'],
  cuit: ['cuit'],
  codigo_barras: ['codigodebarras', 'codigobarras', 'ean', 'barcode', 'codbarras'],
  sku_proveedor: ['sku', 'codigo', 'codigoproveedor', 'skuproveedor'],
  descripcion: ['descripcion', 'producto', 'nombre'],
  precio: ['precio', 'preciounitario', 'preciolista', 'precioneto'],
  capturado_at: ['leido', 'capturado', 'fecha', 'fechalectura', 'capturadoat'],
}

/**
 * Lee el CSV exportado por nombre de columna. Devuelve filas crudas (el precio
 * todavía como texto) para pasarlas por `leerIngesta`. Sin columna de precio
 * no se adivina cuál es: error.
 */
export function leerCsvDeSheets(csv: string): Record<string, string | undefined>[] {
  const [encabezado, ...resto] = filasCsv(csv)
  if (!encabezado) return []
  const idx: Partial<Record<keyof typeof COLUMNAS, number>> = {}
  encabezado.forEach((h, i) => {
    const n = norm(h)
    for (const [clave, alias] of Object.entries(COLUMNAS) as [keyof typeof COLUMNAS, string[]][]) {
      if (idx[clave] === undefined && alias.includes(n)) idx[clave] = i
    }
  })
  if (idx.precio === undefined) {
    throw new Error('la hoja no tiene una columna de precio reconocible (precio, precio unitario, precio lista)')
  }
  return resto.map((celdas) => {
    const fila: Record<string, string | undefined> = {}
    for (const [clave, i] of Object.entries(idx) as [string, number][]) {
      const v = celdas[i]?.trim()
      fila[clave] = v ? v : undefined
    }
    return fila
  })
}
