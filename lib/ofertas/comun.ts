/**
 * Helpers server-side compartidos del módulo Ofertas (OS-6a).
 * Conflictos de calendario (O-10), filas de intercambio SIFACO (O-04/O-05) y
 * sucursales participantes (O-03).
 */
type Adm = any

export async function sucursalesActivasIds(adm: Adm): Promise<string[]> {
  const { data } = await adm.from('sucursales').select('id').eq('activa', true)
  return ((data ?? []) as any[]).map((s) => s.id)
}

/** Sucursales efectivas de una oferta: las declaradas, o todas si está vacío. */
export async function sucursalesDeOferta(adm: Adm, oferta: any): Promise<string[]> {
  const ids = (oferta.sucursales_ids ?? []) as string[]
  return ids.length ? ids : sucursalesActivasIds(adm)
}

function sinFin(o: any): boolean {
  return o.vigencia_tipo !== 'con_fecha' || !o.fecha_fin
}
/** ¿Se cruzan los rangos [aDesde,aHasta] y [bDesde,bHasta]? (null hasta = infinito) */
function fechasCruzan(aDesde: string | null, aHasta: string | null, bDesde: string | null, bHasta: string | null): boolean {
  const ad = aDesde ?? '0000-01-01', ah = aHasta ?? '9999-12-31'
  const bd = bDesde ?? '0000-01-01', bh = bHasta ?? '9999-12-31'
  return ad <= bh && bd <= ah
}

export type Conflicto = { id: string; codigo: string | null; nombre: string; productos: string[]; desde: string | null; hasta: string | null }

/**
 * Ofertas vivas que comparten producto + sucursal + fechas con la propuesta.
 * No bloquea: se usa para avisar (O-10).
 */
export async function conflictosOferta(
  adm: Adm,
  p: { productos: string[]; sucursales: string[]; vigencia_tipo?: string; desde: string | null; hasta: string | null; excluirId?: string },
): Promise<Conflicto[]> {
  const productos = new Set((p.productos ?? []).filter(Boolean))
  if (!productos.size) return []
  const sucs = new Set(p.sucursales ?? [])
  const todasActivas = await sucursalesActivasIds(adm)
  const sucsA = sucs.size ? sucs : new Set(todasActivas)
  const aHasta = p.vigencia_tipo && p.vigencia_tipo !== 'con_fecha' ? null : p.hasta

  const { data } = await adm.from('ofertas')
    .select('id, codigo, nombre, productos_ids, sucursales_ids, vigencia_tipo, fecha_inicio, fecha_fin, estado')
    .in('estado', ['borrador', 'pendiente_aprobacion', 'aprobada', 'activa', 'pausada'])
    .limit(1000)

  const out: Conflicto[] = []
  for (const o of (data ?? []) as any[]) {
    if (p.excluirId && o.id === p.excluirId) continue
    const comunes = (o.productos_ids ?? []).filter((x: string) => productos.has(x))
    if (!comunes.length) continue
    const oSucs = (o.sucursales_ids ?? []).length ? new Set<string>(o.sucursales_ids) : new Set<string>(todasActivas)
    let sucComun = false
    for (const s of sucsA) if (oSucs.has(s)) { sucComun = true; break }
    if (!sucComun) continue
    const oHasta = sinFin(o) ? null : o.fecha_fin
    if (!fechasCruzan(p.desde, aHasta, o.fecha_inicio, oHasta)) continue
    out.push({ id: o.id, codigo: o.codigo, nombre: o.nombre, productos: comunes, desde: o.fecha_inicio, hasta: o.fecha_fin })
  }
  return out
}

/** Precio de oferta por producto: item específico o el valor global de la oferta. */
export function precioDeItem(oferta: any, item: { precio_oferta: number | null }): number | null {
  if (item.precio_oferta != null) return Number(item.precio_oferta)
  if (oferta.tipo === 'precio_fijo' && oferta.valor != null) return Number(oferta.valor)
  return null
}

export type FilaSifaco = { sku: string; ean: string; producto: string; precio: number | null; fecha_inicio: string | null; fecha_fin: string | null; oferta: string }

/**
 * Filas para el intercambio SIFACO. tipo 'aplicacion' → precio_oferta;
 * tipo 'reversion' → precio base actual del catálogo.
 */
export async function filasSifaco(adm: Adm, oferta: any, tipo: 'aplicacion' | 'reversion'): Promise<FilaSifaco[]> {
  const { data: itemsData } = await adm.from('oferta_items').select('producto_id, precio_oferta').eq('oferta_id', oferta.id)
  // Fallback: ofertas sin items (ej. propuestas viejas) → derivar de productos_ids.
  const items = ((itemsData ?? []) as any[]).length ? (itemsData as any[]) : ((oferta.productos_ids ?? []) as string[]).map((pid) => ({ producto_id: pid, precio_oferta: null }))
  const pids = items.map((i) => i.producto_id).filter(Boolean)
  if (!pids.length) return []
  const { data: prods } = await adm.from('productos_catalogo').select('id, sku, codigo_barras, nombre, precio_sugerido').in('id', pids)
  const pMap = new Map(((prods ?? []) as any[]).map((p) => [p.id, p]))
  return ((items ?? []) as any[]).map((it) => {
    const p = pMap.get(it.producto_id); if (!p) return null
    const precio = tipo === 'aplicacion' ? precioDeItem(oferta, it) : (p.precio_sugerido != null ? Number(p.precio_sugerido) : null)
    return { sku: p.sku ?? '', ean: p.codigo_barras ?? '', producto: p.nombre, precio, fecha_inicio: oferta.fecha_inicio, fecha_fin: oferta.fecha_fin, oferta: oferta.nombre }
  }).filter(Boolean) as FilaSifaco[]
}
