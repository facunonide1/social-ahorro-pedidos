import { DOC_DIAS_DATO_FRESCO, DOC_DIAS_VOLUMEN, TENANT_ACTUAL } from '@/lib/documentos/config'

type Adm = any

/**
 * Consultas del histórico de costos.
 *
 * TODO acá trabaja con PRECIO NETO (sin IVA). El IVA es crédito fiscal, no
 * costo: comparar por precio con IVA mezcla un impuesto recuperable con el
 * costo real. Además, en facturas de IVA mixto el precio con IVA por renglón
 * es aproximado (alícuota efectiva promedio), así que compararlo sería comparar
 * estimaciones.
 */

export type EventoCosto = {
  id: string
  fecha: string
  precioNeto: number | null
  precioUnitario: number
  cantidad: number | null
  origen: string
  proveedorId: string | null
  proveedor: string
  documentoId: string | null
  /** Para llegar a la imagen original: es la prueba ante el proveedor. */
  extraccionId: string | null
}

export type FichaCostos = {
  item: { id: string; sku: string; nombre: string }
  eventos: EventoCosto[]
  ultimo: EventoCosto | null
  anterior: EventoCosto | null
  variacion: { pesos: number; pct: number } | null
  acumuladas: { dias: number; pct: number | null }[]
  porProveedor: Array<{
    proveedorId: string | null
    proveedor: string
    ultimoNeto: number | null
    fecha: string
    diasDesde: number
    fresco: boolean
    compras: number
  }>
  volumen: { dias: number; unidades: number }
}

/** El neto es la referencia; si faltara se cae al unitario, que en A es el neto. */
function neto(e: { precioNeto: number | null; precioUnitario: number }): number {
  return e.precioNeto ?? e.precioUnitario
}

function diasDesde(fecha: string): number {
  const d = new Date(fecha + 'T00:00:00')
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86_400_000))
}

/**
 * Ficha de costos de un producto.
 *
 * `soloFacturas` separa lo que costó de lo que dijeron que costaba: un evento
 * con origen 'lista_precios' es una promesa, uno con origen 'factura' es un
 * hecho. Mezclarlos sin distinguir infla o desinfla la serie según qué haya
 * cargado más seguido.
 */
export async function fichaCostos(
  adm: Adm,
  itemId: string,
  opts: { soloFacturas?: boolean } = {},
): Promise<FichaCostos | null> {
  const { data: prod } = await adm
    .from('productos_catalogo')
    .select('id, sku, nombre')
    .eq('id', itemId)
    .maybeSingle()

  if (!prod) return null

  let q = adm
    .from('doc_precios_historial')
    .select('id, fecha, precio_neto, precio_unitario, cantidad, origen, tercero_id, documento_id, proveedores:tercero_id(razon_social)')
    .eq('tenant_id', TENANT_ACTUAL)
    .eq('item_id', itemId)
    .order('fecha', { ascending: false })
    .limit(500)

  if (opts.soloFacturas) q = q.in('origen', ['factura', 'remito'])

  const { data: filas } = await q

  // Una consulta más para llegar a la imagen de cada documento.
  const docIds = [...new Set(((filas ?? []) as any[]).map((f) => f.documento_id).filter(Boolean))]
  const extPorDoc = new Map<string, string>()
  if (docIds.length) {
    const { data: exts } = await adm
      .from('doc_extracciones')
      .select('id, documento_id')
      .in('documento_id', docIds)
    for (const e of (exts ?? []) as any[]) {
      if (e.documento_id && !extPorDoc.has(e.documento_id)) extPorDoc.set(e.documento_id, e.id)
    }
  }

  const eventos: EventoCosto[] = ((filas ?? []) as any[]).map((f) => ({
    id: f.id,
    fecha: f.fecha,
    precioNeto: f.precio_neto != null ? Number(f.precio_neto) : null,
    precioUnitario: Number(f.precio_unitario),
    cantidad: f.cantidad != null ? Number(f.cantidad) : null,
    origen: f.origen,
    proveedorId: f.tercero_id,
    proveedor: f.proveedores?.razon_social ?? 'sin proveedor',
    documentoId: f.documento_id,
    extraccionId: f.documento_id ? extPorDoc.get(f.documento_id) ?? null : null,
  }))

  const ultimo = eventos[0] ?? null
  const anterior = eventos[1] ?? null

  const variacion =
    ultimo && anterior && neto(anterior) > 0
      ? {
          pesos: +(neto(ultimo) - neto(anterior)).toFixed(2),
          pct: +(((neto(ultimo) - neto(anterior)) / neto(anterior)) * 100).toFixed(2),
        }
      : null

  // Variación acumulada: contra el evento más viejo dentro de cada ventana.
  const acumuladas = [30, 90, 180].map((dias) => {
    if (!ultimo) return { dias, pct: null }
    const enVentana = eventos.filter((e) => diasDesde(e.fecha) <= dias)
    const base = enVentana[enVentana.length - 1]
    if (!base || base.id === ultimo.id || neto(base) <= 0) return { dias, pct: null }
    return { dias, pct: +(((neto(ultimo) - neto(base)) / neto(base)) * 100).toFixed(2) }
  })

  // Último precio por proveedor: con qué antigüedad, y cuántas veces compró.
  const porProv = new Map<string, EventoCosto[]>()
  for (const e of eventos) {
    const k = e.proveedorId ?? 'sin'
    porProv.set(k, [...(porProv.get(k) ?? []), e])
  }
  const porProveedor = [...porProv.entries()]
    .map(([k, evs]) => {
      const u = evs[0]
      const d = diasDesde(u.fecha)
      return {
        proveedorId: k === 'sin' ? null : k,
        proveedor: u.proveedor,
        ultimoNeto: neto(u),
        fecha: u.fecha,
        diasDesde: d,
        fresco: d <= DOC_DIAS_DATO_FRESCO,
        compras: evs.length,
      }
    })
    .sort((a, b) => (a.ultimoNeto ?? Infinity) - (b.ultimoNeto ?? Infinity))

  const unidades = eventos
    .filter((e) => diasDesde(e.fecha) <= DOC_DIAS_VOLUMEN)
    .reduce((a, e) => a + (e.cantidad ?? 0), 0)

  return {
    item: prod,
    eventos,
    ultimo,
    anterior,
    variacion,
    acumuladas,
    porProveedor,
    volumen: { dias: DOC_DIAS_VOLUMEN, unidades },
  }
}

// ── Comparador ───────────────────────────────────────────────────────────────

export type CeldaProveedor = {
  proveedorId: string
  neto: number
  fecha: string
  diasDesde: number
  fresco: boolean
  origen: string
}

export type FilaComparador = {
  itemId: string
  sku: string
  nombre: string
  rubro: string | null
  /** Solo los proveedores que REALMENTE vendieron este SKU. Sin datos, sin celda. */
  celdas: Record<string, CeldaProveedor>
  mejor: { proveedorId: string; neto: number; fresco: boolean } | null
  /** Lo último que se pagó, sin importar a quién. */
  ultimoPagado: { proveedorId: string; neto: number; fecha: string } | null
  unidades90: number
  /** (último pagado − mejor disponible) × unidades del período. */
  ahorroPotencial: number
}

/**
 * Arma la grilla del comparador desde el histórico real de compras.
 *
 * Nunca inventa: si un proveedor jamás vendió ese SKU, no hay celda. Cero
 * sería mentira y vacío es la verdad.
 */
export async function grillaComparador(
  adm: Adm,
  opts: { soloFacturas?: boolean; rubro?: string | null } = {},
): Promise<{ filas: FilaComparador[]; proveedores: Array<{ id: string; nombre: string }>; totalAhorro: number }> {
  let q = adm
    .from('doc_precios_historial')
    .select('item_id, tercero_id, fecha, precio_neto, precio_unitario, cantidad, origen, proveedores:tercero_id(razon_social), productos_catalogo:item_id(sku, nombre, rubro)')
    .eq('tenant_id', TENANT_ACTUAL)
    .not('tercero_id', 'is', null)
    .order('fecha', { ascending: false })
    .limit(20000)

  if (opts.soloFacturas) q = q.in('origen', ['factura', 'remito'])

  const { data } = await q
  const filas = (data ?? []) as any[]

  const provs = new Map<string, string>()
  const porItem = new Map<string, FilaComparador>()

  for (const f of filas) {
    const prod = f.productos_catalogo
    if (!prod) continue
    if (opts.rubro && opts.rubro !== 'todos' && prod.rubro !== opts.rubro) continue

    provs.set(f.tercero_id, f.proveedores?.razon_social ?? 'proveedor')

    // Anotado: sin el tipo, `celdas: {}` del literal se infiere como {} vacío.
    const fila: FilaComparador =
      porItem.get(f.item_id) ??
      {
        itemId: f.item_id,
        sku: prod.sku,
        nombre: prod.nombre,
        rubro: prod.rubro ?? null,
        celdas: {},
        mejor: null,
        ultimoPagado: null,
        unidades90: 0,
        ahorroPotencial: 0,
      }

    const n = f.precio_neto != null ? Number(f.precio_neto) : Number(f.precio_unitario)
    const d = diasDesde(f.fecha)

    // Como viene ordenado por fecha desc, la primera vez que aparece un
    // proveedor es su dato más nuevo.
    if (!fila.celdas[f.tercero_id]) {
      fila.celdas[f.tercero_id] = {
        proveedorId: f.tercero_id,
        neto: n,
        fecha: f.fecha,
        diasDesde: d,
        fresco: d <= DOC_DIAS_DATO_FRESCO,
        origen: f.origen,
      }
    }
    if (!fila.ultimoPagado) {
      fila.ultimoPagado = { proveedorId: f.tercero_id, neto: n, fecha: f.fecha }
    }
    if (d <= DOC_DIAS_VOLUMEN) fila.unidades90 += Number(f.cantidad ?? 0)

    porItem.set(f.item_id, fila)
  }

  let totalAhorro = 0
  for (const fila of porItem.values()) {
    // El mejor sale SOLO de datos frescos: un precio de hace seis meses no es
    // una alternativa real, es un recuerdo.
    const frescas = Object.values(fila.celdas).filter((c) => c.fresco)
    const candidatas = frescas.length ? frescas : []
    fila.mejor = candidatas.length
      ? candidatas.reduce((a, b) => (b.neto < a.neto ? b : a))
      : null
    if (fila.mejor) fila.mejor = { proveedorId: fila.mejor.proveedorId, neto: fila.mejor.neto, fresco: true } as any

    if (fila.mejor && fila.ultimoPagado && fila.unidades90 > 0) {
      const dif = fila.ultimoPagado.neto - fila.mejor.neto
      fila.ahorroPotencial = dif > 0 ? +(dif * fila.unidades90).toFixed(2) : 0
      totalAhorro += fila.ahorroPotencial
    }
  }

  return {
    filas: [...porItem.values()].sort((a, b) => b.ahorroPotencial - a.ahorroPotencial),
    proveedores: [...provs.entries()].map(([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre)),
    totalAhorro: +totalAhorro.toFixed(2),
  }
}
