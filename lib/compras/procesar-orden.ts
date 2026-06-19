/**
 * Procesamiento de órdenes de compra — capa separada para la integración
 * futura con SIFACO (F20).
 *
 * Hoy se usa para normalizar los ítems de una orden (calcular cantidad total
 * desde la distribución por sucursal y el total estimado). Cuando llegue la
 * integración directa con SIFACO, el parser de su export/registro vivirá acá,
 * devolviendo el mismo shape `OrdenItemNormalizado[]` que consume la API.
 */

export type DistribucionMap = Record<string, number> // sucursal_id → cantidad

export type OrdenItemInput = {
  producto_id?: string | null
  descripcion?: string | null
  costo_unitario?: number | null
  distribucion?: DistribucionMap | null
  origen_aviso_id?: string | null
}

export type OrdenItemNormalizado = {
  producto_id: string | null
  descripcion: string | null
  cantidad_total: number
  costo_unitario: number
  distribucion: DistribucionMap
  origen_aviso_id: string | null
}

export function sumarDistribucion(d: DistribucionMap | null | undefined): number {
  if (!d) return 0
  return Object.values(d).reduce((a, n) => a + (Number(n) || 0), 0)
}

/** Normaliza los ítems crudos a la forma persistible y calcula el total. */
export function normalizarOrden(items: OrdenItemInput[]): {
  items: OrdenItemNormalizado[]
  totalEstimado: number
} {
  const norm = items.map((it) => {
    const distribucion: DistribucionMap = {}
    for (const [suc, qty] of Object.entries(it.distribucion ?? {})) {
      const n = Number(qty) || 0
      if (n > 0) distribucion[suc] = n
    }
    const cantidad_total = sumarDistribucion(distribucion)
    const costo_unitario = Number(it.costo_unitario) || 0
    return {
      producto_id: it.producto_id ?? null,
      descripcion: it.descripcion ?? null,
      cantidad_total,
      costo_unitario,
      distribucion,
      origen_aviso_id: it.origen_aviso_id ?? null,
    }
  }).filter((it) => it.cantidad_total > 0 || it.costo_unitario > 0)

  const totalEstimado = norm.reduce((a, it) => a + it.cantidad_total * it.costo_unitario, 0)
  return { items: norm, totalEstimado }
}

/**
 * Stub de parser SIFACO (F20). Recibirá el export de SIFACO (Excel/JSON) y
 * devolverá ítems normalizados. Por ahora no implementado; se carga manual o
 * por el importador genérico con mapeo.
 */
export function parseSifacoExport(_raw: unknown): OrdenItemNormalizado[] {
  throw new Error('Integración SIFACO directa pendiente (F20). Usá carga manual o importador.')
}
