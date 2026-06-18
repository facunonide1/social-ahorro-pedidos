/**
 * Procesamiento del import de vencimientos (OPS · T4). Crea/actualiza lotes.
 * Idempotente por (producto + numero_lote + sucursal). Reusa el matching por
 * SKU→EAN→nombre contra productos_catalogo.
 */

export type FilaVenc = {
  fila: number
  sku?: string | null
  ean?: string | null
  nombre?: string | null
  numero_lote: string | null
  fecha_vencimiento: string | null // YYYY-MM-DD
  cantidad: number
  costo?: number | null
}

export type ItemVencAnalizado = {
  fila: number
  sku: string | null
  ean: string | null
  nombre_origen: string | null
  producto_id: string | null
  nombre_match: string | null
  numero_lote: string | null
  fecha_vencimiento: string | null
  cantidad: number
  costo: number | null
  estado: 'ok' | 'sin_match' | 'fecha_invalida'
}

function norm(s?: string | null): string {
  return (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
}

/** Normaliza una fecha de varios formatos comunes a YYYY-MM-DD (o null). */
export function normFecha(s?: string | null): string | null {
  if (!s) return null
  const t = s.trim()
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = t.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/) // dd/mm/yyyy
  if (m) {
    const d = m[1].padStart(2, '0'), mo = m[2].padStart(2, '0')
    let y = m[3]; if (y.length === 2) y = `20${y}`
    return `${y}-${mo}-${d}`
  }
  return null
}

export async function analizarVencimientos(adm: any, filas: FilaVenc[]): Promise<ItemVencAnalizado[]> {
  const { data: cat } = await adm.from('productos_catalogo').select('id, sku, codigo_barras, nombre').eq('activo', true).limit(20000)
  const catalogo = (cat ?? []) as any[]
  const porSku = new Map<string, any>(), porEan = new Map<string, any>(), porNombre = new Map<string, any>()
  for (const c of catalogo) {
    if (c.sku) porSku.set(c.sku.trim().toLowerCase(), c)
    if (c.codigo_barras) porEan.set(c.codigo_barras.trim(), c)
    porNombre.set(norm(c.nombre), c)
  }
  return filas.map((f) => {
    const sku = f.sku?.trim() || null, ean = f.ean?.trim() || null, nombre = f.nombre?.trim() || null
    let match: any = null
    if (sku && porSku.has(sku.toLowerCase())) match = porSku.get(sku.toLowerCase())
    else if (ean && porEan.has(ean)) match = porEan.get(ean)
    else if (nombre && porNombre.has(norm(nombre))) match = porNombre.get(norm(nombre))
    const fecha = normFecha(f.fecha_vencimiento)
    const estado: ItemVencAnalizado['estado'] = !match ? 'sin_match' : !fecha ? 'fecha_invalida' : 'ok'
    return {
      fila: f.fila, sku, ean, nombre_origen: nombre, producto_id: match?.id ?? null, nombre_match: match?.nombre ?? null,
      numero_lote: f.numero_lote?.trim() || null, fecha_vencimiento: fecha, cantidad: f.cantidad,
      costo: f.costo ?? null, estado,
    }
  })
}

export async function confirmarVencimientos(
  adm: any,
  args: { sucursalId: string; items: ItemVencAnalizado[]; esDemo?: boolean },
): Promise<{ creados: number; actualizados: number; omitidos: number }> {
  let creados = 0, actualizados = 0, omitidos = 0
  for (const i of args.items) {
    if (i.estado !== 'ok' || !i.producto_id || !i.fecha_vencimiento) { omitidos++; continue }
    const { data: ex } = await adm.from('lotes_productos').select('id')
      .eq('producto_id', i.producto_id).eq('sucursal_id', args.sucursalId)
      .eq('numero_lote', i.numero_lote ?? '').maybeSingle()
    if (ex) {
      await adm.from('lotes_productos').update({
        fecha_vencimiento: i.fecha_vencimiento, cantidad_actual: i.cantidad,
        costo_unitario: i.costo, estado: 'activo',
      }).eq('id', ex.id)
      actualizados++
    } else {
      await adm.from('lotes_productos').insert({
        producto_id: i.producto_id, sucursal_id: args.sucursalId, numero_lote: i.numero_lote,
        fecha_vencimiento: i.fecha_vencimiento, cantidad_actual: i.cantidad, costo_unitario: i.costo,
        estado: 'activo', es_demo: args.esDemo ?? false,
      })
      creados++
    }
  }
  return { creados, actualizados, omitidos }
}
