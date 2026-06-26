/**
 * Vencimientos por producto (sin lotes, carga manual). NORA decide la acción
 * cruzando días al vencimiento + stock en góndola/depósito + rotación.
 */
type Adm = any

export type AccionVenc = 'reponer' | 'oferta' | 'transferir' | 'baja' | 'vigilar'
export type VencimientoRow = {
  id: string; producto_id: string | null; sku: string | null; producto: string
  sucursal_id: string; sucursal: string; fecha_vencimiento: string; cantidad: number
  ubicacion: string; dias_restantes: number; stock_gondola: number; stock_deposito: number
  valor_riesgo: number; accion: AccionVenc; accion_label: string; motivo: string
}

function sugerir(dias: number, cantidad: number, gondola: number, deposito: number): { accion: AccionVenc; label: string; motivo: string } {
  if (dias <= 0) return { accion: 'baja', label: 'Dar de baja / rematar ya', motivo: 'ya está vencido o vence hoy' }
  if (dias > 45) return { accion: 'vigilar', label: 'Vigilar', motivo: `vence en ${dias} días, hay tiempo` }
  if (gondola < cantidad && deposito > 0) return { accion: 'reponer', label: 'Reponer góndola', motivo: 'vence pronto y hay poco en góndola: subí lo del depósito para que se venda' }
  if (gondola >= cantidad * 2) return { accion: 'oferta', label: 'Liquidar con oferta', motivo: 'vence pronto y sobra en góndola: rematalo con descuento antes de perderlo' }
  return { accion: 'transferir', label: 'Transferir a otra sucursal', motivo: 'vence pronto y acá no rota: movelo a una sucursal donde se venda' }
}

export async function getVencimientos(adm: Adm, f: { sucursalId: string | null; esTodas: boolean }): Promise<VencimientoRow[]> {
  let q = adm.from('vencimientos')
    .select('id, producto_id, sku, sucursal_id, fecha_vencimiento, cantidad, ubicacion, productos_catalogo(nombre, precio_sugerido, precio_costo_promedio), sucursales(nombre)')
    .eq('estado', 'vigente').order('fecha_vencimiento', { ascending: true }).limit(500)
  if (!f.esTodas && f.sucursalId) q = q.eq('sucursal_id', f.sucursalId)
  const { data } = await q
  const filas = (data ?? []) as any[]
  if (!filas.length) return []

  // stock góndola/depósito de esos productos en esas sucursales
  const claves = filas.map((v) => ({ p: v.producto_id, s: v.sucursal_id })).filter((x) => x.p)
  const prodIds = Array.from(new Set(claves.map((c) => c.p)))
  const { data: stock } = await adm.from('stock_items').select('producto_id, sucursal_id, cantidad_gondola, cantidad_deposito').in('producto_id', prodIds.length ? prodIds : ['00000000-0000-0000-0000-000000000000'])
  const stockMap = new Map<string, { g: number; d: number }>()
  for (const s of (stock ?? []) as any[]) stockMap.set(`${s.producto_id}|${s.sucursal_id}`, { g: Number(s.cantidad_gondola ?? 0), d: Number(s.cantidad_deposito ?? 0) })

  const hoy = Date.now()
  const rows = filas.map((v) => {
    const dias = Math.ceil((new Date(v.fecha_vencimiento).getTime() - hoy) / 86400000)
    const st = stockMap.get(`${v.producto_id}|${v.sucursal_id}`) ?? { g: 0, d: 0 }
    const costo = Number(v.productos_catalogo?.precio_costo_promedio ?? 0) || Number(v.productos_catalogo?.precio_sugerido ?? 0) * 0.6
    const valor = Math.round(Number(v.cantidad) * costo)
    const sug = sugerir(dias, Number(v.cantidad), st.g, st.d)
    return {
      id: v.id, producto_id: v.producto_id, sku: v.sku, producto: v.productos_catalogo?.nombre ?? v.sku ?? '—',
      sucursal_id: v.sucursal_id, sucursal: v.sucursales?.nombre ?? '—', fecha_vencimiento: v.fecha_vencimiento,
      cantidad: Number(v.cantidad), ubicacion: v.ubicacion, dias_restantes: dias,
      stock_gondola: st.g, stock_deposito: st.d, valor_riesgo: valor,
      accion: sug.accion, accion_label: sug.label, motivo: sug.motivo,
    } as VencimientoRow
  })
  // orden por plata en riesgo (desc), luego urgencia (asc)
  return rows.sort((a, b) => b.valor_riesgo - a.valor_riesgo || a.dias_restantes - b.dias_restantes)
}

export function resumenVencimientos(rows: VencimientoRow[]) {
  const urgentes = rows.filter((r) => r.dias_restantes <= 30)
  return {
    total: rows.length,
    urgentes: urgentes.length,
    valor_riesgo: rows.reduce((a, r) => a + r.valor_riesgo, 0),
    valor_urgente: urgentes.reduce((a, r) => a + r.valor_riesgo, 0),
    vencidos: rows.filter((r) => r.dias_restantes <= 0).length,
  }
}
