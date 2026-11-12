/**
 * CRONS QUE NO PUEDEN PASAR LOS 60 SEGUNDOS.
 *
 * alertas-stock y metricas-stock recorren 192.000 filas de stock. De una sola
 * vez no entran en una función de Vercel. Esto las parte en TRAMOS de
 * productos: el espacio de UUID de `producto_id` se divide en N rangos
 * parejos (los UUID v4 son aleatorios, así que cada rango tiene ~1/N de los
 * productos), y cada corrida procesa un tramo para todas las sucursales.
 *
 * ── QUÉ TRAMO TOCA ──────────────────────────────────────────────────────────
 *
 * Un solo cron cada 5 minutos dentro de una ventana de una hora. El tramo sale
 * del reloj: minuto / 5, módulo N. Con N=6 y 12 corridas por hora, cada tramo
 * corre dos veces: si la primera no llegó, la segunda lo retoma. No hace falta
 * guardar un cursor en la base.
 *
 * ── EL PLAZO ────────────────────────────────────────────────────────────────
 *
 * Cada corrida tiene un plazo para LEER (40 s). Si se pasa, corta sin escribir
 * nada: lo que estaba guardado sigue como estaba. Escribir tiene otro plazo
 * (52 s) que se mira entre tandas, así nunca se corta a la mitad de una.
 */

export const TRAMOS_POR_DEFECTO = 6
export const PLAZO_LECTURA_MS = 40_000
export const PLAZO_ESCRITURA_MS = 52_000

export interface Rango {
  /** Incluido. */
  desde: string
  /** Excluido. null = hasta el final. */
  hasta: string | null
}

function uuidDe(n: number): string {
  const h = n.toString(16).padStart(8, '0')
  return `${h}-0000-0000-0000-000000000000`
}

/** El rango de UUID del tramo `i` de `n`. Los tramos cubren todo sin pisarse. */
export function rangoDeTramo(i: number, n: number): Rango {
  if (!Number.isInteger(n) || n < 1 || n > 4096) throw new Error('rangoDeTramo: n entre 1 y 4096')
  if (!Number.isInteger(i) || i < 0 || i >= n) throw new Error(`rangoDeTramo: tramo ${i} fuera de 0..${n - 1}`)
  const total = 0x1_0000_0000
  const desde = Math.floor((total * i) / n)
  const hasta = i === n - 1 ? null : Math.floor((total * (i + 1)) / n)
  return { desde: uuidDe(desde), hasta: hasta == null ? null : uuidDe(hasta) }
}

/** ¿El UUID cae en el rango? (Postgres compara uuid como bytes; en hex minúscula es lo mismo.) */
export function enRango(uuid: string, r: Rango): boolean {
  const u = uuid.toLowerCase()
  return u >= r.desde && (r.hasta == null || u < r.hasta)
}

/** Aplica el rango a una consulta de PostgREST sobre la columna dada. */
export function filtrarRango<Q extends { gte: (c: string, v: string) => Q; lt: (c: string, v: string) => Q }>(
  q: Q, columna: string, r: Rango,
): Q {
  const conDesde = q.gte(columna, r.desde)
  return r.hasta == null ? conDesde : conDesde.lt(columna, r.hasta)
}

/**
 * El tramo de esta corrida. Si viene `?tramo=` se usa ese (corrida manual);
 * si no, sale del reloj: minuto UTC / 5, módulo n.
 */
export function tramoDeLaCorrida(url: URL | null, ahora: Date, n: number): number {
  const pedido = url?.searchParams.get('tramo')
  if (pedido != null && pedido !== '') {
    const i = Number(pedido)
    if (!Number.isInteger(i) || i < 0 || i >= n) throw new Error(`tramo ${pedido} fuera de 0..${n - 1}`)
    return i
  }
  return Math.floor(ahora.getUTCMinutes() / 5) % n
}

export class PlazoVencido extends Error {
  constructor(public que: string, public ms: number) {
    super(`${que}: se pasó el plazo (${Math.round(ms / 1000)} s); no se escribió nada de esta parte`)
    this.name = 'PlazoVencido'
  }
}

export class Plazo {
  private t0: number
  constructor(private reloj: () => number = () => Date.now()) { this.t0 = reloj() }
  transcurrido(): number { return this.reloj() - this.t0 }
  /** Tira PlazoVencido si ya pasó `ms` desde el inicio. */
  exigir(ms: number, que: string): void {
    const t = this.transcurrido()
    if (t > ms) throw new PlazoVencido(que, t)
  }
  queda(ms: number): boolean { return this.transcurrido() <= ms }
}

type Rangeable<T> = { range: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: unknown }> }

/**
 * Pagina de a 1000 y mira el plazo antes de cada página. La consulta tiene que
 * venir ordenada por una columna única (o con desempate).
 */
export async function paginarConPlazo<T>(
  consulta: Rangeable<T>, que: string, plazo: Plazo, plazoMs: number = PLAZO_LECTURA_MS,
): Promise<T[]> {
  const filas: T[] = []
  for (let desde = 0; ; desde += 1000) {
    plazo.exigir(plazoMs, que)
    const { data, error } = await consulta.range(desde, desde + 999)
    if (error) throw new Error(`${que}: ${(error as any)?.message ?? error}`)
    const tanda = data ?? []
    filas.push(...tanda)
    if (tanda.length < 1000) return filas
  }
}

/** JSON con las claves ordenadas: jsonb no guarda el orden en que se escribió. */
export function canonico(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null)
  if (Array.isArray(v)) return `[${v.map(canonico).join(',')}]`
  const o = v as Record<string, unknown>
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort()
    .map((k) => `${JSON.stringify(k)}:${canonico(o[k])}`).join(',')}}`
}

export interface AlertaClave {
  tipo: string
  producto_id: string | null
  sucursal_id: string | null
  lote_id?: string | null
  severidad: string
  datos: unknown
}

export const claveDeAlerta = (a: AlertaClave) =>
  `${a.tipo}|${a.producto_id ?? ''}|${a.sucursal_id ?? ''}|${a.lote_id ?? ''}`

/**
 * Lo mínimo que hay que escribir para pasar de `existentes` a `nuevas`:
 *   - borrar: ids de las que ya no valen
 *   - reemplazar: las que siguen pero cambió la severidad o los datos (se
 *     borran y se insertan de a pares por tanda)
 *   - insertar: las que no estaban
 * Las que no cambiaron no se tocan, y conservan su `created_at`.
 */
export function diferenciaAlertas<N extends AlertaClave>(
  existentes: readonly (AlertaClave & { id: string })[],
  nuevas: readonly N[],
): { borrar: string[]; reemplazar: { id: string; nueva: N }[]; insertar: N[] } {
  const porClave = new Map(existentes.map((e) => [claveDeAlerta(e), e]))
  const vistas = new Set<string>()
  const reemplazar: { id: string; nueva: N }[] = []
  const insertar: N[] = []
  for (const n of nuevas) {
    const k = claveDeAlerta(n)
    if (vistas.has(k)) continue // el índice único no admite dos activas iguales
    vistas.add(k)
    const e = porClave.get(k)
    if (!e) insertar.push(n)
    else if (e.severidad !== n.severidad || canonico(e.datos) !== canonico(n.datos)) reemplazar.push({ id: e.id, nueva: n })
  }
  const borrar = existentes.filter((e) => !vistas.has(claveDeAlerta(e))).map((e) => e.id)
  return { borrar, reemplazar, insertar }
}
