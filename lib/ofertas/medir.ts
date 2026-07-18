/**
 * Rendimiento real de ofertas (OS-6b · O-09). Cruza ventas por SKU×día×sucursal
 * (ventas_diarias, del import nocturno) en la ventana previa (14d, normalizada
 * por día) vs. durante la oferta. Escribe ofertas.metricas + ofertas_aprendizaje.
 * La medición DEPENDE de que los nocturnos estén cargados (hoy el seed es demo);
 * si no hay ventas en la ventana, no escribe métricas y reintenta (lazy backfill).
 */
type Adm = any

const UMBRAL_UPLIFT = 15   // % de mejora para "vendió"
const DESC_ALTO = 25       // % de descuento considerado alto

export type EtiquetaOferta = 'vendio' | 'regalo_margen' | 'neutra'
export const ETIQUETA_LABEL: Record<string, string> = { vendio: 'Vendió', regalo_margen: 'Regaló margen', neutra: 'Neutra' }

function diaISO(d: Date): string { return d.toISOString().slice(0, 10) }
function sumarDias(iso: string, n: number): string { return diaISO(new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000)) }
function diasEntre(a: string, b: string): number { return Math.max(1, Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000) + 1) }

/** Mide una oferta finalizada. Devuelve las métricas o null si no hay datos suficientes. */
export async function medirOferta(adm: Adm, oferta: any): Promise<any | null> {
  const { data: its } = await adm.from('oferta_items').select('producto_id').eq('oferta_id', oferta.id)
  let pids = ((its ?? []) as any[]).map((i) => i.producto_id).filter(Boolean)
  if (!pids.length) pids = ((oferta.productos_ids ?? []) as string[]).filter(Boolean)
  if (!pids.length) return null

  const inicio = oferta.fecha_inicio ?? (oferta.aprobada_at ? String(oferta.aprobada_at).slice(0, 10) : null)
  const fin = oferta.fecha_fin ?? (oferta.finalizada_at ? String(oferta.finalizada_at).slice(0, 10) : diaISO(new Date()))
  if (!inicio) return null
  const durDias = diasEntre(inicio, fin)
  const prevFin = sumarDias(inicio, -1), prevInicio = sumarDias(inicio, -14), prevDias = 14

  let q = adm.from('ventas_diarias').select('producto_id, sucursal_id, fecha, cantidad').in('producto_id', pids).gte('fecha', prevInicio).lte('fecha', fin)
  const sucFiltro = (oferta.sucursales_ids ?? []) as string[]
  if (sucFiltro.length) q = q.in('sucursal_id', sucFiltro)
  const { data: ventas } = await q.limit(50000)
  const rows = (ventas ?? []) as any[]
  if (!rows.length) return null   // sin nocturnos en la ventana → reintenta más tarde

  let durUnits = 0, prevUnits = 0
  const porSuc = new Map<string, { dur: number; prev: number }>()
  for (const r of rows) {
    const dentro = r.fecha >= inicio && r.fecha <= fin
    const c = Number(r.cantidad ?? 0)
    const s = porSuc.get(r.sucursal_id) ?? { dur: 0, prev: 0 }
    if (dentro) { durUnits += c; s.dur += c } else { prevUnits += c; s.prev += c }
    porSuc.set(r.sucursal_id, s)
  }
  const durPerDay = durUnits / durDias, prevPerDay = prevUnits / prevDias
  const uplift_pct = prevPerDay > 0 ? Math.round(((durPerDay - prevPerDay) / prevPerDay) * 100) : (durUnits > 0 ? 100 : 0)
  const unidades_incrementales = Math.round(durUnits - prevPerDay * durDias)

  // Margen entregado ≈ Σ unidades_durante × descuento_unitario (precio base × %, o precio_base − precio_fijo).
  let margen = 0
  try {
    const { data: prods } = await adm.from('productos_catalogo').select('id, precio_sugerido').in('id', pids)
    const precioBase = new Map(((prods ?? []) as any[]).map((p) => [p.id, Number(p.precio_sugerido ?? 0)]))
    const { data: itemsPrecio } = await adm.from('oferta_items').select('producto_id, precio_oferta').eq('oferta_id', oferta.id)
    const precioOf = new Map(((itemsPrecio ?? []) as any[]).map((i) => [i.producto_id, i.precio_oferta != null ? Number(i.precio_oferta) : null]))
    const unidsProd = new Map<string, number>()
    for (const r of rows) if (r.fecha >= inicio && r.fecha <= fin) unidsProd.set(r.producto_id, (unidsProd.get(r.producto_id) ?? 0) + Number(r.cantidad ?? 0))
    for (const pid of pids) {
      const base = precioBase.get(pid) ?? 0
      const pof = precioOf.get(pid)
      const descU = pof != null ? Math.max(0, base - pof) : (oferta.tipo === 'porcentaje_descuento' && oferta.valor != null ? base * (Number(oferta.valor) / 100) : 0)
      margen += (unidsProd.get(pid) ?? 0) * descU
    }
  } catch { margen = 0 }

  // Mejor sucursal por uplift.
  let mejorSuc: string | null = null, mejorUp = -Infinity
  for (const [sid, v] of porSuc) {
    const up = (v.prev / prevDias) > 0 ? ((v.dur / durDias) - (v.prev / prevDias)) / (v.prev / prevDias) : (v.dur > 0 ? 1 : 0)
    if (up > mejorUp) { mejorUp = up; mejorSuc = sid }
  }
  let mejorSucNombre = '—'
  if (mejorSuc) { const { data: s } = await adm.from('sucursales').select('nombre').eq('id', mejorSuc).maybeSingle(); mejorSucNombre = s?.nombre ?? '—' }

  const descTotal = oferta.tipo === 'porcentaje_descuento' && oferta.valor != null ? Number(oferta.valor) : (oferta.tipo === 'segunda_unidad_pct' ? Number(oferta.valor ?? 0) / 2 : 0)
  let etiqueta: EtiquetaOferta = 'neutra'
  if (uplift_pct > UMBRAL_UPLIFT) etiqueta = 'vendio'
  else if (uplift_pct < 5 && descTotal >= DESC_ALTO) etiqueta = 'regalo_margen'

  return {
    uplift_pct, mejor_sucursal: mejorSucNombre, unidades: durUnits, unidades_incrementales,
    margen_entregado_estimado: Math.round(margen), etiqueta, medido_at: new Date().toISOString(),
  }
}

/** Actualiza el aprendizaje (tipo × rubro) con el uplift de una oferta medida. */
async function actualizarAprendizaje(adm: Adm, oferta: any, uplift: number) {
  const rubro = oferta.rubro ?? 'general'
  const { data: prev } = await adm.from('ofertas_aprendizaje').select('id, uplift_promedio, n_casos').eq('tipo_oferta', oferta.tipo).eq('rubro', rubro).maybeSingle()
  if (prev) {
    const n = Number(prev.n_casos ?? 0)
    const nuevo = (Number(prev.uplift_promedio ?? 0) * n + uplift) / (n + 1)
    await adm.from('ofertas_aprendizaje').update({ uplift_promedio: Math.round(nuevo * 10) / 10, n_casos: n + 1, updated_at: new Date().toISOString() }).eq('id', prev.id)
  } else {
    await adm.from('ofertas_aprendizaje').insert({ tipo_oferta: oferta.tipo, rubro, uplift_promedio: uplift, n_casos: 1 })
  }
}

/** Hook de cierre (llamado desde finalizarOferta). Best-effort. */
export async function cerrarMetricasOferta(adm: Adm, oferta: any): Promise<void> {
  try {
    const m = await medirOferta(adm, oferta)
    if (!m) return
    await adm.from('ofertas').update({ metricas: m }).eq('id', oferta.id)
    await actualizarAprendizaje(adm, oferta, m.uplift_pct)
  } catch { /* reintenta el backfill */ }
}

/** Lazy backfill: mide las finalizadas que todavía no tienen métricas (nocturnos que llegaron después). */
export async function medirFinalizadasSinMetricas(adm: Adm): Promise<number> {
  const { data } = await adm.from('ofertas').select('*').eq('estado', 'finalizada').limit(200)
  let n = 0
  for (const o of (data ?? []) as any[]) {
    if (o.metricas && Object.keys(o.metricas).length && o.metricas.medido_at) continue
    try {
      const m = await medirOferta(adm, o)
      if (!m) continue
      await adm.from('ofertas').update({ metricas: m }).eq('id', o.id)
      await actualizarAprendizaje(adm, o, m.uplift_pct)
      n++
    } catch { /* sigue */ }
  }
  return n
}
