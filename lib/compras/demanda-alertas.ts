/**
 * RADAR · alertas de demanda. Mismo texto/producto pedido ≥ umbral veces en la
 * ventana → sugerencia para la franja NORA de Compras y "Lo urgente".
 */
type Adm = any

export type DemandaAlerta = { clave: string; texto: string; veces: number; producto_id: string | null }

export async function demandaAlertas(adm: Adm, dias = 30, umbral = 3, max = 5): Promise<DemandaAlerta[]> {
  try {
    const desde = new Date(Date.now() - dias * 86_400_000).toISOString()
    const { data } = await adm.from('demanda_invisible').select('texto_pedido, producto_id').gte('created_at', desde).limit(5000)
    const rows = (data ?? []) as any[]
    if (!rows.length) return []
    const g = new Map<string, { texto: string; veces: number; producto_id: string | null }>()
    for (const r of rows) {
      const clave = r.producto_id ? `p:${r.producto_id}` : `t:${String(r.texto_pedido ?? '').toLowerCase().trim()}`
      if (clave === 't:') continue
      const e = g.get(clave) ?? { texto: r.texto_pedido, veces: 0, producto_id: r.producto_id ?? null }
      e.veces++; g.set(clave, e)
    }
    // Nombre real para los que matchean producto.
    const pids = [...g.values()].filter((e) => e.producto_id).map((e) => e.producto_id as string)
    if (pids.length) {
      const { data: prods } = await adm.from('productos_catalogo').select('id, nombre').in('id', pids)
      const nombreById = new Map(((prods ?? []) as any[]).map((p) => [p.id, p.nombre]))
      for (const e of g.values()) if (e.producto_id && nombreById.has(e.producto_id)) e.texto = nombreById.get(e.producto_id)
    }
    return [...g.entries()].map(([clave, e]) => ({ clave, texto: e.texto, veces: e.veces, producto_id: e.producto_id }))
      .filter((e) => e.veces >= umbral).sort((a, b) => b.veces - a.veces).slice(0, max)
  } catch { return [] }
}
