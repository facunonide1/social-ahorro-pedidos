import { paginar } from '@/lib/supabase/paginar'

/**
 * EL CATÁLOGO ENTERO, EN MEMORIA, SIN CORTARSE.
 *
 * ── POR QUÉ HACE FALTA ──────────────────────────────────────────────────────
 *
 * Media docena de lugares hacen lo mismo: traer el catálogo y armar un Map para
 * cruzar por id, por SKU o por código de barras. El matcher de documentos, el
 * cron de alertas, los importadores, las exportaciones.
 *
 * Todos lo escribían así:
 *
 *     const { data } = await adm.from('productos_catalogo').select('id, sku, nombre')
 *     const mapa = new Map(data.map((p) => [p.id, p]))
 *
 * Con 46.009 productos eso arma un Map de **mil**. Y no falla: el matcher
 * simplemente no encuentra el 98% de los renglones y contesta «sin match». Un
 * cruce que no encuentra se lee como «el proveedor mandó cosas que no tenemos»,
 * y esa lectura manda a alguien a dar de alta productos que ya existían.
 *
 * ── LA REGLA ────────────────────────────────────────────────────────────────
 *
 * Si algo necesita el catálogo completo, lo pide acá. No se vuelve a escribir
 * un `.from('productos_catalogo')` sin límite en ningún lado: el auditor de
 * `scripts/auditar-cortes.mjs` lo va a marcar.
 *
 * Ojo con el costo: son 46.000 filas. Esto es para crons, importadores y
 * cálculos — NO para una pantalla. Una pantalla acota y dice cuánto acotó.
 */

type Adm = any

export interface ProductoIndexado {
  id: string
  sku: string
  nombre: string
  codigo_barras: string | null
  precio_sugerido: number | null
  precio_costo_promedio: number | null
  activo: boolean
}

const COLUMNAS = 'id, sku, nombre, codigo_barras, precio_sugerido, precio_costo_promedio, activo'

export interface OpcionesIndice {
  /** Sólo activos. Por defecto sí: es lo que quieren todos los que llaman. */
  soloActivos?: boolean
  /** Incluir los de demostración. Por defecto no. */
  incluirDemo?: boolean
}

/**
 * Todas las filas del catálogo, paginadas de verdad.
 *
 * Va ordenado por `sku` porque `paginar` lo exige: sin `order`, PostgREST no
 * garantiza el mismo orden entre páginas y se pierden o se repiten filas — el
 * mismo error silencioso con otra cara.
 */
export async function catalogoCompleto(
  adm: Adm,
  opts: OpcionesIndice = {},
): Promise<ProductoIndexado[]> {
  let q = adm.from('productos_catalogo').select(COLUMNAS)
  if (opts.soloActivos !== false) q = q.eq('activo', true)
  if (!opts.incluirDemo) q = q.eq('es_demo', false)
  const { filas } = await paginar<ProductoIndexado>(q.order('sku'), { maximo: 200_000 })
  return filas
}

export interface IndiceCatalogo {
  porId: Map<string, ProductoIndexado>
  porSku: Map<string, ProductoIndexado>
  /** Un código de barras puede repetirse entre productos: gana el primero por SKU. */
  porBarras: Map<string, ProductoIndexado>
  filas: ProductoIndexado[]
}

/** El catálogo indexado por las tres claves con las que se lo busca. */
export async function indiceCatalogo(
  adm: Adm,
  opts: OpcionesIndice = {},
): Promise<IndiceCatalogo> {
  const filas = await catalogoCompleto(adm, opts)
  const porId = new Map<string, ProductoIndexado>()
  const porSku = new Map<string, ProductoIndexado>()
  const porBarras = new Map<string, ProductoIndexado>()

  for (const p of filas) {
    porId.set(p.id, p)
    if (p.sku) porSku.set(p.sku, p)
    const b = (p.codigo_barras ?? '').trim()
    if (b && b !== '0' && !porBarras.has(b)) porBarras.set(b, p)
  }

  return { porId, porSku, porBarras, filas }
}

/**
 * Los códigos de barras de todos los productos, para cruzar por EAN.
 *
 * Sale de `producto_codigos_barras`, que tiene 49.339 filas: un producto puede
 * tener hasta cuatro. `productos_catalogo.codigo_barras` guarda sólo el
 * principal, así que cruzar por esa columna pierde los alternativos.
 */
export async function indicePorCodigoBarras(adm: Adm): Promise<Map<string, string>> {
  const { filas } = await paginar<{ codigo: string; producto_id: string }>(
    adm.from('producto_codigos_barras').select('codigo, producto_id').order('codigo'),
    { maximo: 200_000 },
  )
  const m = new Map<string, string>()
  for (const f of filas) if (!m.has(f.codigo)) m.set(f.codigo, f.producto_id)
  return m
}

/**
 * El catálogo para una PANTALLA, paginado y con tope explícito.
 *
 * Distinto de `catalogoCompleto`: una pantalla no necesita las 46.009 filas —
 * necesita las que va a mostrar y saber cuántas hay. El tope es alto para que
 * los cruces salgan bien, pero es un tope, y quien llama recibe `truncado` para
 * poder decirlo.
 */
export async function paginarProductos(
  sb: Adm,
  columnas: string,
  opts: { maximo?: number } = {},
): Promise<{ data: any[]; truncado: boolean }> {
  const { filas, truncado } = await paginar<any>(
    sb.from('productos_catalogo').select(columnas).eq('activo', true).eq('es_demo', false).order('sku'),
    { maximo: opts.maximo ?? 50_000 },
  )
  return { data: filas, truncado }
}
