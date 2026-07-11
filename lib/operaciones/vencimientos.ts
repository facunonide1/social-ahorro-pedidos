/**
 * Vencimientos (OS-3): vista UNIFICADA de dos fuentes —
 *   · `vencimientos`      (carga manual por producto, puede fijar proveedor)
 *   · `lotes_productos`   (real de recepción, trae costo y número de lote)
 * y la CASCADA de 4 acciones alrededor de la VENTANA DE DEVOLUCIÓN.
 *
 * La fecha que manda NO es el vencimiento sino la fecha LÍMITE DE DEVOLUCIÓN =
 * fecha_vencimiento − dias_ventana(proveedor/rubro). Si no se conoce el
 * proveedor, la ventana es DESCONOCIDA (no se inventa).
 *
 * Al resolver una fila se escribe en su fuente de origen (`origen`): las manual
 * en `vencimientos`, las de lote NO se “resuelven” en la tabla (son derivadas);
 * la acción que las toca (devolución/baja) deja su rastro en su propio registro.
 */
type Adm = any

export type AccionVenc = 'devolver' | 'reponer' | 'transferir' | 'liquidar' | 'baja' | 'vigilar'
export type VentanaEstado = 'abierta' | 'por_cerrar' | 'cerrada' | 'desconocida'

/** Descuentos sugeridos para liquidar según días al vencimiento (configurable). */
export const DESCUENTO_LIQUIDAR = { mayor60: 15, entre31y60: 25, hasta30: 40 } as const
export const VENTANA_POR_CERRAR_DIAS = 7

export type VencimientoRow = {
  id: string
  origen: 'manual' | 'lote'
  dos_fuentes: boolean
  producto_id: string | null
  sku: string | null
  producto: string
  sucursal_id: string
  sucursal: string
  proveedor_id: string | null
  fecha_vencimiento: string
  dias_restantes: number
  cantidad: number
  ubicacion: string
  lote: string | null
  lote_id: string | null
  ventana_dias: number | null
  ventana_cierra: string | null
  dias_ventana_restantes: number | null
  ventana_estado: VentanaEstado
  stock_gondola: number
  stock_deposito: number
  dias_stock_restante: number | null
  costo: number
  valor_riesgo: number
  accion: AccionVenc
  accion_label: string
  motivo: string
  monto: number
  descuento_pct: number | null
}

/**
 * Cascada de decisión (en orden de prioridad). Devuelve la acción + porqué.
 * seVendeATiempo = se vende antes de vencer (dias_stock_restante ≤ días a vencer).
 */
function sugerir(args: {
  diasAVencer: number
  diasStockRestante: number | null
  gondola: number
  deposito: number
  cantidad: number
  ventana: VentanaEstado
  mejorOtraSucursal: number | null // dias_stock_restante de la sucursal que más rápido lo vende
}): { accion: AccionVenc; label: string; motivo: string; descuento_pct: number | null } {
  const { diasAVencer, diasStockRestante, gondola, deposito, cantidad, ventana, mejorOtraSucursal } = args
  if (diasAVencer <= 0) return { accion: 'baja', label: 'Dar de baja', motivo: 'ya está vencido', descuento_pct: null }

  const seVendeATiempo = diasStockRestante != null && diasStockRestante <= diasAVencer

  // 1º DEVOLVER — ventana abierta y NO se vende a tiempo → recuperás el 100%.
  if ((ventana === 'abierta' || ventana === 'por_cerrar') && !seVendeATiempo) {
    return { accion: 'devolver', label: 'Devolver a droguería', motivo: `no se vende a tiempo y la droguería todavía lo acepta${ventana === 'por_cerrar' ? ' (¡ventana por cerrar!)' : ''}`, descuento_pct: null }
  }
  // 2º REPONER — hay depósito, falta góndola, y SÍ se vende a tiempo.
  if (deposito > 0 && gondola < cantidad && seVendeATiempo) {
    return { accion: 'reponer', label: 'Reponer góndola', motivo: 'se vende a tiempo: subí lo del depósito', descuento_pct: null }
  }
  // 3º TRANSFERIR — otra sucursal lo vende más rápido y ahí sí se agota antes de vencer.
  if (!seVendeATiempo && mejorOtraSucursal != null && mejorOtraSucursal <= diasAVencer) {
    return { accion: 'transferir', label: 'Transferir a otra sucursal', motivo: 'acá no rota pero en otra sucursal se vende a tiempo', descuento_pct: null }
  }
  // 4º LIQUIDAR — ventana cerrada/desconocida y no se vende a tiempo → oferta con descuento.
  if (!seVendeATiempo) {
    const desc = diasAVencer > 60 ? DESCUENTO_LIQUIDAR.mayor60 : diasAVencer > 30 ? DESCUENTO_LIQUIDAR.entre31y60 : DESCUENTO_LIQUIDAR.hasta30
    return { accion: 'liquidar', label: `Liquidar −${desc}%`, motivo: ventana === 'cerrada' ? 'ventana de devolución cerrada: rematalo antes de perderlo' : 'sin devolución posible y no rota: rematalo con descuento', descuento_pct: desc }
  }
  return { accion: 'vigilar', label: 'Vigilar', motivo: `se vende a tiempo (${diasStockRestante}d de stock vs ${diasAVencer}d a vencer)`, descuento_pct: null }
}

/** Ventana en días para un proveedor+rubro: fila por rubro > default del proveedor > desconocida. */
function resolverVentanaDias(
  proveedorId: string | null,
  rubro: string | null,
  provDefault: Map<string, number | null>,
  provRubro: Map<string, number>,
): number | null {
  if (!proveedorId) return null
  if (rubro) {
    const r = provRubro.get(`${proveedorId}|${rubro.toLowerCase()}`)
    if (r != null) return r
  }
  const d = provDefault.get(proveedorId)
  return d ?? null
}

export async function getVencimientos(adm: Adm, f: { sucursalId: string | null; esTodas: boolean }): Promise<VencimientoRow[]> {
  const horizonteISO = new Date(Date.now() + 120 * 86400000).toISOString().slice(0, 10)
  const scope = (q: any) => (!f.esTodas && f.sucursalId ? q.eq('sucursal_id', f.sucursalId) : q)

  // Fuente 1: manual (vencimientos). Fuente 2: lotes de recepción con fecha.
  const [manualRes, loteRes, provRes, rubroRes] = await Promise.all([
    scope(adm.from('vencimientos')
      .select('id, producto_id, sku, sucursal_id, proveedor_id, fecha_vencimiento, cantidad, ubicacion, productos_catalogo(nombre, precio_sugerido, precio_costo_promedio, rubro), sucursales(nombre)')
      .eq('estado', 'vigente').eq('es_demo', false)).order('fecha_vencimiento', { ascending: true }).limit(600),
    scope(adm.from('lotes_productos')
      .select('id, producto_id, sucursal_id, numero_lote, fecha_vencimiento, cantidad_actual, costo_unitario, productos_catalogo(nombre, sku, precio_sugerido, precio_costo_promedio, rubro), sucursales(nombre)')
      .eq('es_demo', false).gt('cantidad_actual', 0).not('fecha_vencimiento', 'is', null).lte('fecha_vencimiento', horizonteISO)).order('fecha_vencimiento', { ascending: true }).limit(600),
    adm.from('proveedores').select('id, dias_ventana_devolucion'),
    adm.from('proveedor_devolucion_rubros').select('proveedor_id, rubro, dias_ventana'),
  ])

  const provDefault = new Map<string, number | null>(((provRes.data ?? []) as any[]).map((p) => [p.id, p.dias_ventana_devolucion ?? null]))
  const provRubro = new Map<string, number>()
  for (const r of (rubroRes.data ?? []) as any[]) provRubro.set(`${r.proveedor_id}|${String(r.rubro).toLowerCase()}`, r.dias_ventana)

  const manual = (manualRes.data ?? []) as any[]
  const lotes = (loteRes.data ?? []) as any[]

  // Stock góndola/depósito de todos los productos involucrados.
  const prodIds = Array.from(new Set([...manual, ...lotes].map((v) => v.producto_id).filter(Boolean)))
  const { data: stock } = await adm.from('stock_items').select('producto_id, sucursal_id, cantidad_gondola, cantidad_deposito')
    .in('producto_id', prodIds.length ? prodIds : ['00000000-0000-0000-0000-000000000000'])
  const stockMap = new Map<string, { g: number; d: number }>()
  for (const s of (stock ?? []) as any[]) stockMap.set(`${s.producto_id}|${s.sucursal_id}`, { g: Number(s.cantidad_gondola ?? 0), d: Number(s.cantidad_deposito ?? 0) })

  // Rotación por producto (todas las sucursales) → dias_stock_restante propio + mejor otra sucursal.
  const { data: rot } = await adm.from('producto_rotacion').select('producto_id, sucursal_id, dias_stock_restante')
    .in('producto_id', prodIds.length ? prodIds : ['00000000-0000-0000-0000-000000000000'])
  const rotSelf = new Map<string, number | null>()
  const rotByProd = new Map<string, { sucursal_id: string; dias: number | null }[]>()
  for (const r of (rot ?? []) as any[]) {
    const dias = r.dias_stock_restante == null ? null : Number(r.dias_stock_restante)
    rotSelf.set(`${r.producto_id}|${r.sucursal_id}`, dias)
    const arr = rotByProd.get(r.producto_id) ?? []
    arr.push({ sucursal_id: r.sucursal_id, dias })
    rotByProd.set(r.producto_id, arr)
  }

  const hoy = Date.now()
  const dxV = (fecha: string) => Math.ceil((new Date(fecha).getTime() - hoy) / 86400000)

  function armar(
    id: string, origen: 'manual' | 'lote', producto_id: string | null, sku: string | null, producto: string,
    sucursal_id: string, sucursal: string, proveedor_id: string | null, fecha: string, cantidad: number,
    ubicacion: string, lote: string | null, lote_id: string | null, rubro: string | null, costo: number,
  ): VencimientoRow {
    const dias = dxV(fecha)
    const st = stockMap.get(`${producto_id}|${sucursal_id}`) ?? { g: 0, d: 0 }
    const diasStock = rotSelf.get(`${producto_id}|${sucursal_id}`) ?? null
    const otras = (rotByProd.get(producto_id ?? '') ?? []).filter((x) => x.sucursal_id !== sucursal_id && x.dias != null).map((x) => x.dias as number)
    const mejorOtra = otras.length ? Math.min(...otras) : null

    const ventanaDias = resolverVentanaDias(proveedor_id, rubro, provDefault, provRubro)
    let ventanaCierra: string | null = null
    let diasVentana: number | null = null
    let ventanaEstado: VentanaEstado = 'desconocida'
    if (ventanaDias != null) {
      ventanaCierra = new Date(new Date(fecha).getTime() - ventanaDias * 86400000).toISOString().slice(0, 10)
      diasVentana = Math.ceil((new Date(ventanaCierra).getTime() - hoy) / 86400000)
      ventanaEstado = diasVentana < 0 ? 'cerrada' : diasVentana <= VENTANA_POR_CERRAR_DIAS ? 'por_cerrar' : 'abierta'
    }

    const sug = sugerir({ diasAVencer: dias, diasStockRestante: diasStock, gondola: st.g, deposito: st.d, cantidad, ventana: ventanaEstado, mejorOtraSucursal: mejorOtra })
    const monto = Math.round(cantidad * costo)

    return {
      id, origen, dos_fuentes: false, producto_id, sku, producto, sucursal_id, sucursal, proveedor_id,
      fecha_vencimiento: fecha, dias_restantes: dias, cantidad, ubicacion, lote, lote_id,
      ventana_dias: ventanaDias, ventana_cierra: ventanaCierra, dias_ventana_restantes: diasVentana, ventana_estado: ventanaEstado,
      stock_gondola: st.g, stock_deposito: st.d, dias_stock_restante: diasStock,
      costo, valor_riesgo: monto, accion: sug.accion, accion_label: sug.label, motivo: sug.motivo, monto, descuento_pct: sug.descuento_pct,
    }
  }

  const filasLote = lotes.map((v) => {
    const costo = Number(v.costo_unitario ?? 0) || Number(v.productos_catalogo?.precio_costo_promedio ?? 0) || Number(v.productos_catalogo?.precio_sugerido ?? 0) * 0.6
    return armar(v.id, 'lote', v.producto_id, v.productos_catalogo?.sku ?? null, v.productos_catalogo?.nombre ?? '—', v.sucursal_id, v.sucursales?.nombre ?? '—', null, v.fecha_vencimiento, Number(v.cantidad_actual), 'deposito', v.numero_lote ?? null, v.id, v.productos_catalogo?.rubro ?? null, costo)
  })
  const filasManual = manual.map((v) => {
    const costo = Number(v.productos_catalogo?.precio_costo_promedio ?? 0) || Number(v.productos_catalogo?.precio_sugerido ?? 0) * 0.6
    return armar(v.id, 'manual', v.producto_id, v.sku, v.productos_catalogo?.nombre ?? v.sku ?? '—', v.sucursal_id, v.sucursales?.nombre ?? '—', v.proveedor_id ?? null, v.fecha_vencimiento, Number(v.cantidad), v.ubicacion ?? 'gondola', null, null, v.productos_catalogo?.rubro ?? null, costo)
  })

  // Dedupe visual: manual + lote del mismo SKU|sucursal con fechas cercanas (±15d) → 1 fila (prioriza lote).
  const usados = new Set<string>()
  for (const l of filasLote) {
    const dup = filasManual.find((m) => !usados.has(m.id) && m.producto_id && m.producto_id === l.producto_id && m.sucursal_id === l.sucursal_id &&
      Math.abs(new Date(m.fecha_vencimiento).getTime() - new Date(l.fecha_vencimiento).getTime()) <= 15 * 86400000)
    if (dup) { l.dos_fuentes = true; usados.add(dup.id) }
  }
  const filas = [...filasLote, ...filasManual.filter((m) => !usados.has(m.id))]

  // Orden: urgencia de VENTANA primero (las que cierran antes), luego plata en riesgo.
  return filas.sort((a, b) => {
    const va = a.dias_ventana_restantes == null ? 1e9 : a.dias_ventana_restantes
    const vb = b.dias_ventana_restantes == null ? 1e9 : b.dias_ventana_restantes
    return va - vb || b.valor_riesgo - a.valor_riesgo || a.dias_restantes - b.dias_restantes
  })
}

export function resumenVencimientos(rows: VencimientoRow[]) {
  const urgentes = rows.filter((r) => r.dias_restantes <= 30)
  const devolver = rows.filter((r) => r.accion === 'devolver')
  const porCerrar = devolver.filter((r) => r.ventana_estado === 'por_cerrar')
  return {
    total: rows.length,
    urgentes: urgentes.length,
    valor_riesgo: rows.reduce((a, r) => a + r.valor_riesgo, 0),
    valor_urgente: urgentes.reduce((a, r) => a + r.valor_riesgo, 0),
    vencidos: rows.filter((r) => r.dias_restantes <= 0).length,
    recuperable_devolviendo: devolver.reduce((a, r) => a + r.monto, 0),
    devolver_count: devolver.length,
    ventana_por_cerrar: porCerrar.length,
    ventana_por_cerrar_monto: porCerrar.reduce((a, r) => a + r.monto, 0),
  }
}
