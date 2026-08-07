import {
  DOC_CONC_MONTO_MINIMO,
  DOC_CONC_TOL_CANTIDAD,
  DOC_CONC_TOL_PRECIO_ARS,
  DOC_CONC_TOL_PRECIO_PCT,
  TENANT_ACTUAL,
} from '@/lib/documentos/config'

type Adm = any

export type FilaConciliacion = {
  itemId: string
  sku: string
  nombre: string
  pedido: number | null
  recibido: number | null
  facturado: number | null
  netoPactado: number | null
  netoFacturado: number | null
  /** No se pudo comparar porque las unidades no coinciden y falta el factor. */
  noComparable: boolean
  unidadDocumento: string | null
  diferencias: DiferenciaFila[]
}

export type DiferenciaFila = {
  tipo: 'cantidad_faltante' | 'facturado_de_mas' | 'precio_distinto'
  cantidad: number
  monto: number
  pct: number | null
}

export type ResultadoConciliacion = {
  estado: 'abierta' | 'conciliada' | 'con_diferencias'
  filas: FilaConciliacion[]
  totales: { cantidadFaltante: number; facturadoDeMas: number; precioDistinto: number; total: number }
  falta: string[]
  noComparables: number
}

/** Suma las cantidades de un conjunto de documentos, por item. */
type Acumulado = Map<string, { cantidad: number; neto: number | null; unidad: string | null }>

function acumular(lineas: any[], factores: Map<string, number>): Acumulado {
  const m: Acumulado = new Map()
  for (const l of lineas) {
    if (!l.item_id) continue
    if (l.match_estado === 'ignorado') continue

    const unidad = (l.unidad ?? '').trim().toLowerCase() || null
    // El factor convierte la unidad del papel a unidad de venta. Sin factor se
    // toma tal cual y la fila se marca aparte como no comparable.
    const factor = unidad ? factores.get(`${l.item_id}|${unidad}`) ?? null : null
    const cant = Number(l.cantidad ?? 0) * (factor ?? 1)
    const neto = l.precio_neto != null ? Number(l.precio_neto) / (factor ?? 1) : null

    const prev = m.get(l.item_id)
    m.set(l.item_id, {
      cantidad: (prev?.cantidad ?? 0) + cant,
      // El precio de referencia es el del último documento que lo trae.
      neto: neto ?? prev?.neto ?? null,
      unidad: unidad ?? prev?.unidad ?? null,
    })
  }
  return m
}

/**
 * Concilia una compra: orden contra remitos contra facturas.
 *
 * Escribe el resultado en doc_conciliaciones (estado, diferencias, monto) para
 * que la bandeja no tenga que recalcular en cada consulta.
 */
export async function conciliar(
  adm: Adm,
  conciliacionId: string,
  userId: string | null,
): Promise<ResultadoConciliacion> {
  const [{ data: ordenesLink }, { data: docsLink }] = await Promise.all([
    adm.from('doc_conciliacion_ordenes').select('orden_id').eq('conciliacion_id', conciliacionId),
    adm.from('doc_conciliacion_documentos').select('documento_id, rol').eq('conciliacion_id', conciliacionId),
  ])

  const ordenIds = ((ordenesLink ?? []) as any[]).map((o) => o.orden_id)
  const docs = (docsLink ?? []) as any[]
  const remitoIds = docs.filter((d) => d.rol === 'remito').map((d) => d.documento_id)
  const facturaIds = docs.filter((d) => d.rol === 'factura').map((d) => d.documento_id)
  const ncIds = docs.filter((d) => d.rol === 'nota_credito').map((d) => d.documento_id)

  // Ítems de la orden.
  const { data: itemsOrden } = ordenIds.length
    ? await adm
        .from('orden_compra_items')
        .select('producto_id, cantidad_total, costo_unitario')
        .in('orden_id', ordenIds)
    : { data: [] as any[] }

  const todosDocIds = [...remitoIds, ...facturaIds, ...ncIds]
  const { data: lineasDocs } = todosDocIds.length
    ? await adm
        .from('doc_lineas')
        .select('documento_id, item_id, cantidad, unidad, precio_neto, precio_unitario, match_estado')
        .in('documento_id', todosDocIds)
    : { data: [] as any[] }

  const lineas = (lineasDocs ?? []) as any[]

  // Factores de conversión conocidos para estos productos y este proveedor.
  const { data: conc } = await adm
    .from('doc_conciliaciones')
    .select('proveedor_id')
    .eq('id', conciliacionId)
    .maybeSingle()

  const itemIdsTodos = [
    ...new Set([...(itemsOrden ?? []).map((i: any) => i.producto_id), ...lineas.map((l) => l.item_id)].filter(Boolean)),
  ]

  const factores = new Map<string, number>()
  if (itemIdsTodos.length) {
    const { data: fs } = await adm
      .from('doc_factores_unidad')
      .select('item_id, unidad_documento, factor, tercero_id')
      .eq('tenant_id', TENANT_ACTUAL)
      .in('item_id', itemIdsTodos)
    for (const f of (fs ?? []) as any[]) {
      // El del proveedor gana sobre el genérico: la caja de cada uno es distinta.
      const k = `${f.item_id}|${String(f.unidad_documento).toLowerCase()}`
      if (f.tercero_id === conc?.proveedor_id || !factores.has(k)) factores.set(k, Number(f.factor))
    }
  }

  const pedido = new Map<string, { cantidad: number; neto: number | null }>()
  for (const i of (itemsOrden ?? []) as any[]) {
    if (!i.producto_id) continue
    const p = pedido.get(i.producto_id)
    pedido.set(i.producto_id, {
      cantidad: (p?.cantidad ?? 0) + Number(i.cantidad_total ?? 0),
      neto: i.costo_unitario != null ? Number(i.costo_unitario) : (p?.neto ?? null),
    })
  }

  const recibido = acumular(lineas.filter((l) => remitoIds.includes(l.documento_id)), factores)
  const facturado = acumular(lineas.filter((l) => facturaIds.includes(l.documento_id)), factores)

  // Un SKU presente en cualquiera de los tres es una fila: la ausencia también
  // es información (te facturaron algo que no pediste ni recibiste).
  const itemIds = [...new Set([...pedido.keys(), ...recibido.keys(), ...facturado.keys()])]

  const { data: prods } = itemIds.length
    ? await adm.from('productos_catalogo').select('id, sku, nombre').in('id', itemIds)
    : { data: [] as any[] }
  const prodPorId = new Map(((prods ?? []) as any[]).map((p) => [p.id, p]))

  const filas: FilaConciliacion[] = []
  const totales = { cantidadFaltante: 0, facturadoDeMas: 0, precioDistinto: 0, total: 0 }
  let noComparables = 0

  for (const itemId of itemIds) {
    const p = pedido.get(itemId)
    const r = recibido.get(itemId)
    const f = facturado.get(itemId)
    const prod = prodPorId.get(itemId)

    const unidadDoc = f?.unidad ?? r?.unidad ?? null
    // Si el papel declara una unidad que no conocemos y no hay factor cargado,
    // no se compara: adivinar el factor desbalancea todo el resultado.
    const necesitaFactor =
      !!unidadDoc && !['un', 'unidad', 'unidades', 'u', ''].includes(unidadDoc) && !factores.has(`${itemId}|${unidadDoc}`)

    const fila: FilaConciliacion = {
      itemId,
      sku: prod?.sku ?? '—',
      nombre: prod?.nombre ?? 'producto',
      pedido: p?.cantidad ?? null,
      recibido: r?.cantidad ?? null,
      facturado: f?.cantidad ?? null,
      netoPactado: p?.neto ?? null,
      netoFacturado: f?.neto ?? null,
      noComparable: necesitaFactor,
      unidadDocumento: unidadDoc,
      diferencias: [],
    }

    if (necesitaFactor) {
      noComparables++
      filas.push(fila)
      continue
    }

    // 1 · Cantidad faltante: pediste más de lo que entregaron.
    if (p && r && p.cantidad - r.cantidad > DOC_CONC_TOL_CANTIDAD) {
      const cant = +(p.cantidad - r.cantidad).toFixed(4)
      const monto = +(cant * (p.neto ?? f?.neto ?? 0)).toFixed(2)
      fila.diferencias.push({
        tipo: 'cantidad_faltante',
        cantidad: cant,
        monto,
        pct: p.cantidad > 0 ? +((cant / p.cantidad) * 100).toFixed(2) : null,
      })
      totales.cantidadFaltante += monto
    }

    // 2 · Facturado de más: cobraron lo que no entregaron. Solo tiene sentido
    //     si hay remito con qué comparar.
    if (f && r && f.cantidad - r.cantidad > DOC_CONC_TOL_CANTIDAD) {
      const cant = +(f.cantidad - r.cantidad).toFixed(4)
      const monto = +(cant * (f.neto ?? 0)).toFixed(2)
      fila.diferencias.push({
        tipo: 'facturado_de_mas',
        cantidad: cant,
        monto,
        pct: r.cantidad > 0 ? +((cant / r.cantidad) * 100).toFixed(2) : null,
      })
      totales.facturadoDeMas += monto
    }

    // 3 · Precio distinto al pactado en la orden.
    if (p?.neto != null && f?.neto != null && p.neto > 0) {
      const dif = f.neto - p.neto
      const pctDif = (dif / p.neto) * 100
      const tolerancia = Math.max(DOC_CONC_TOL_PRECIO_ARS, (p.neto * DOC_CONC_TOL_PRECIO_PCT) / 100)
      if (Math.abs(dif) > tolerancia) {
        const unidades = f.cantidad || 0
        const monto = +(dif * unidades).toFixed(2)
        fila.diferencias.push({
          tipo: 'precio_distinto',
          cantidad: +dif.toFixed(4),
          monto,
          pct: +pctDif.toFixed(2),
        })
        totales.precioDistinto += monto
      }
    }

    filas.push(fila)
  }

  totales.total = +(totales.cantidadFaltante + totales.facturadoDeMas + totales.precioDistinto).toFixed(2)

  // Qué papel falta para poder cerrar el caso.
  const falta: string[] = []
  if (!ordenIds.length) falta.push('la orden de compra')
  if (!remitoIds.length) falta.push('el remito')
  if (!facturaIds.length) falta.push('la factura')

  const hayDiferencias = filas.some((f) => f.diferencias.length)
  // Bajo el mínimo cierra sola: perseguir $80 cuesta más que los $80, y una
  // bandeja llena de casos chicos hace que no se miren los grandes.
  const superaMinimo = Math.abs(totales.total) >= DOC_CONC_MONTO_MINIMO

  let estado: ResultadoConciliacion['estado']
  if (!facturaIds.length) estado = 'abierta'
  else if (hayDiferencias && superaMinimo) estado = 'con_diferencias'
  else estado = 'conciliada'

  await adm
    .from('doc_conciliaciones')
    .update({
      estado,
      diferencias: filas.filter((f) => f.diferencias.length || f.noComparable),
      monto_diferencia: totales.total,
      evaluada_at: new Date().toISOString(),
    })
    .eq('id', conciliacionId)

  return { estado, filas, totales, falta, noComparables }
}
