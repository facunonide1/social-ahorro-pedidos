/**
 * Control de irregularidades de stock (cruce diario stock vs ventas por sucursal).
 * El cálculo vive en SQL (calcular_irregularidades_stock); acá están las consultas
 * de lectura + detección de patrones (control de robo) + cruce con caja.
 */
type Adm = any

export type IrregularidadRow = {
  id: string
  fecha: string
  sucursal_id: string
  sucursal: string
  sku: string
  producto: string
  stock_anterior: number
  ventas_dia: number
  stock_esperado: number
  stock_real: number
  diferencia: number
  tipo: 'faltante' | 'sobrante' | 'ok'
  valor_diferencia: number
  estado: 'pendiente' | 'revisada' | 'justificada'
  nota: string | null
  created_at: string
}

export type FiltroIrreg = {
  sucursalId: string | null
  esTodas: boolean
  fecha?: string | null
  tipo?: string | null
  estado?: string | null
}

/** Lista de irregularidades, ordenadas por valor $ (las que más plata representan). */
export async function getIrregularidades(adm: Adm, f: FiltroIrreg, limit = 500): Promise<IrregularidadRow[]> {
  let q = adm.from('irregularidades_stock')
    .select('id, fecha, sucursal_id, sku, stock_anterior, ventas_dia, stock_esperado, stock_real, diferencia, tipo, valor_diferencia, estado, nota, created_at, productos_catalogo(nombre), sucursales(nombre)')
    .limit(limit)
  if (!f.esTodas && f.sucursalId) q = q.eq('sucursal_id', f.sucursalId)
  if (f.fecha) q = q.eq('fecha', f.fecha)
  if (f.tipo) q = q.eq('tipo', f.tipo)
  if (f.estado) q = q.eq('estado', f.estado)
  const { data } = await q
  const rows = ((data ?? []) as any[]).map((r) => ({
    id: r.id, fecha: r.fecha, sucursal_id: r.sucursal_id,
    sucursal: r.sucursales?.nombre ?? '—', sku: r.sku,
    producto: r.productos_catalogo?.nombre ?? r.sku,
    stock_anterior: Number(r.stock_anterior), ventas_dia: Number(r.ventas_dia),
    stock_esperado: Number(r.stock_esperado), stock_real: Number(r.stock_real),
    diferencia: Number(r.diferencia), tipo: r.tipo, valor_diferencia: Number(r.valor_diferencia),
    estado: r.estado, nota: r.nota, created_at: r.created_at,
  })) as IrregularidadRow[]
  // orden por magnitud de plata (desc)
  return rows.sort((a, b) => Math.abs(b.valor_diferencia) - Math.abs(a.valor_diferencia))
}

export type ResumenIrreg = {
  total: number
  faltantes: number
  sobrantes: number
  pendientes: number
  valor_faltante: number
  valor_sobrante: number
  ultima_fecha: string | null
  fechas: string[]
  por_sucursal: { sucursal_id: string; sucursal: string; cantidad: number; valor: number }[]
}

export async function getResumenIrregularidades(adm: Adm, f: FiltroIrreg): Promise<ResumenIrreg> {
  const rows = await getIrregularidades(adm, f, 5000)
  const faltantes = rows.filter((r) => r.tipo === 'faltante')
  const sobrantes = rows.filter((r) => r.tipo === 'sobrante')
  const fechas = Array.from(new Set(rows.map((r) => r.fecha))).sort().reverse()
  const bySuc = new Map<string, { sucursal_id: string; sucursal: string; cantidad: number; valor: number }>()
  for (const r of rows) {
    const g = bySuc.get(r.sucursal_id) ?? { sucursal_id: r.sucursal_id, sucursal: r.sucursal, cantidad: 0, valor: 0 }
    g.cantidad++; g.valor += Math.abs(r.valor_diferencia)
    bySuc.set(r.sucursal_id, g)
  }
  return {
    total: rows.length,
    faltantes: faltantes.length, sobrantes: sobrantes.length,
    pendientes: rows.filter((r) => r.estado === 'pendiente').length,
    valor_faltante: Math.round(faltantes.reduce((a, r) => a + Math.abs(r.valor_diferencia), 0)),
    valor_sobrante: Math.round(sobrantes.reduce((a, r) => a + Math.abs(r.valor_diferencia), 0)),
    ultima_fecha: fechas[0] ?? null, fechas,
    por_sucursal: Array.from(bySuc.values()).sort((a, b) => b.valor - a.valor),
  }
}

export type Patron = {
  tipo: 'sku_recurrente' | 'sucursal_concentrada' | 'caja_y_stock' | 'cajero'
  titulo: string
  detalle: string
  valor: number
  ref?: Record<string, unknown>
}

/**
 * Patrones sospechosos (control de robo): SKU que descuadra seguido, sucursal
 * concentrada, días con descuadre de caja Y stock, cajeros con diferencias.
 */
export async function getPatrones(adm: Adm, f: { sucursalId: string | null; esTodas: boolean }): Promise<Patron[]> {
  const rows = await getIrregularidades(adm, { ...f }, 5000)
  const patrones: Patron[] = []

  // 1) SKU recurrente (faltante en ≥2 ocasiones)
  const porSku = new Map<string, { producto: string; ocasiones: number; sucursales: Set<string>; valor: number }>()
  for (const r of rows.filter((x) => x.tipo === 'faltante')) {
    const g = porSku.get(r.sku) ?? { producto: r.producto, ocasiones: 0, sucursales: new Set(), valor: 0 }
    g.ocasiones++; g.sucursales.add(r.sucursal); g.valor += Math.abs(r.valor_diferencia)
    porSku.set(r.sku, g)
  }
  for (const [sku, g] of Array.from(porSku.entries()).filter(([, g]) => g.ocasiones >= 2).sort((a, b) => b[1].valor - a[1].valor).slice(0, 8)) {
    patrones.push({
      tipo: 'sku_recurrente',
      titulo: `${g.producto} falta seguido`,
      detalle: `Descuadró ${g.ocasiones} veces${g.sucursales.size > 1 ? ` en ${g.sucursales.size} sucursales` : ` en ${[...g.sucursales][0]}`}. Posible robo o merma sistemática.`,
      valor: Math.round(g.valor), ref: { sku },
    })
  }

  // 2) Sucursal concentrada (la que más pérdida acumula)
  const porSuc = new Map<string, { sucursal: string; cantidad: number; valor: number }>()
  for (const r of rows.filter((x) => x.tipo === 'faltante')) {
    const g = porSuc.get(r.sucursal_id) ?? { sucursal: r.sucursal, cantidad: 0, valor: 0 }
    g.cantidad++; g.valor += Math.abs(r.valor_diferencia)
    porSuc.set(r.sucursal_id, g)
  }
  const sucTop = Array.from(porSuc.values()).sort((a, b) => b.valor - a.valor)[0]
  if (sucTop && sucTop.cantidad >= 3) {
    patrones.push({
      tipo: 'sucursal_concentrada',
      titulo: `${sucTop.sucursal} concentra las pérdidas`,
      detalle: `${sucTop.cantidad} faltantes acumulan $${sucTop.valor.toLocaleString('es-AR')}. Revisá controles de esa sucursal.`,
      valor: Math.round(sucTop.valor),
    })
  }

  // 3) Cruce con caja: días/sucursales con descuadre de caja Y de stock (foto de pérdidas)
  try {
    const fechas = Array.from(new Set(rows.map((r) => r.fecha)))
    if (fechas.length) {
      let qa = adm.from('arqueos_caja').select('fecha, sucursal_id, cajero_nombre, diferencia_cierre, sucursales(nombre)')
        .neq('diferencia_cierre', 0).in('fecha', fechas)
      if (!f.esTodas && f.sucursalId) qa = qa.eq('sucursal_id', f.sucursalId)
      const { data: arqueos } = await qa
      const stockPorSucFecha = new Map<string, number>()
      for (const r of rows.filter((x) => x.tipo === 'faltante')) {
        const k = `${r.sucursal_id}|${r.fecha}`
        stockPorSucFecha.set(k, (stockPorSucFecha.get(k) ?? 0) + Math.abs(r.valor_diferencia))
      }
      const cajeroDif = new Map<string, { cajero: string; veces: number; total: number }>()
      for (const a of (arqueos ?? []) as any[]) {
        const k = `${a.sucursal_id}|${a.fecha}`
        const stockVal = stockPorSucFecha.get(k)
        if (stockVal) {
          patrones.push({
            tipo: 'caja_y_stock',
            titulo: `${a.sucursales?.nombre ?? 'Sucursal'} el ${a.fecha}: caja Y stock descuadrados`,
            detalle: `Caja con diferencia de $${Math.round(Math.abs(a.diferencia_cierre)).toLocaleString('es-AR')} y faltante de stock por $${Math.round(stockVal).toLocaleString('es-AR')}${a.cajero_nombre ? ` (cajero ${a.cajero_nombre})` : ''}. Foco de pérdida.`,
            valor: Math.round(Math.abs(a.diferencia_cierre) + stockVal),
          })
        }
        if (a.cajero_nombre) {
          const c = cajeroDif.get(a.cajero_nombre) ?? { cajero: a.cajero_nombre, veces: 0, total: 0 }
          c.veces++; c.total += Math.abs(Number(a.diferencia_cierre))
          cajeroDif.set(a.cajero_nombre, c)
        }
      }
      // 4) Cajero con diferencias repetidas
      for (const c of Array.from(cajeroDif.values()).filter((c) => c.veces >= 2).sort((a, b) => b.total - a.total).slice(0, 4)) {
        patrones.push({
          tipo: 'cajero',
          titulo: `${c.cajero}: diferencias de caja repetidas`,
          detalle: `${c.veces} cierres con diferencia, $${Math.round(c.total).toLocaleString('es-AR')} en total. Cruzá con su turno y el stock.`,
          valor: Math.round(c.total),
        })
      }
    }
  } catch { /* el cruce con caja no bloquea */ }

  return patrones.sort((a, b) => b.valor - a.valor).slice(0, 20)
}

// ============================================================================
// Pérdidas UNIFICADAS (caja + stock + zonas + transferencias) y rankings (M4)
// ============================================================================
export type PerdidasUnificadas = {
  total: number
  stock_faltante: number
  caja_diferencia: number
  zona_descuadre: number
  transferencia_diferencia: number
}

export async function getPerdidasUnificadas(adm: Adm, f: { sucursalId: string | null; esTodas: boolean }): Promise<PerdidasUnificadas> {
  const scope = (q: any, col = 'sucursal_id') => (!f.esTodas && f.sucursalId ? q.eq(col, f.sucursalId) : q)
  const [irr, caja, zona, transf] = await Promise.all([
    scope(adm.from('irregularidades_stock').select('valor_diferencia').eq('tipo', 'faltante')),
    scope(adm.from('arqueos_caja').select('diferencia_cierre').neq('diferencia_cierre', 0)),
    scope(adm.from('controles_zona').select('valor_diferencia').eq('estado', 'cerrado')),
    adm.from('transferencias_sucursal').select('id').eq('diferencia_detectada', true),
  ])
  const stockFalt = ((irr.data ?? []) as any[]).reduce((a, r) => a + Math.abs(Number(r.valor_diferencia)), 0)
  const cajaDif = ((caja.data ?? []) as any[]).reduce((a, r) => a + Math.abs(Number(r.diferencia_cierre)), 0)
  const zonaDif = ((zona.data ?? []) as any[]).reduce((a, r) => a + Math.abs(Number(r.valor_diferencia)), 0)
  const transfDif = ((transf.data ?? []) as any[]).length
  return {
    stock_faltante: Math.round(stockFalt), caja_diferencia: Math.round(cajaDif),
    zona_descuadre: Math.round(zonaDif), transferencia_diferencia: transfDif,
    total: Math.round(stockFalt + cajaDif + zonaDif),
  }
}

export type RankItem = { nombre: string; sub: string | null; casos: number; valor: number }
export type Rankings = { productos: RankItem[]; sucursales: RankItem[]; zonas: RankItem[]; cajeros: RankItem[] }

export async function getRankings(adm: Adm, f: { sucursalId: string | null; esTodas: boolean }): Promise<Rankings> {
  const rows = await getIrregularidades(adm, f, 5000)
  const falt = rows.filter((r) => r.tipo === 'faltante')

  const acc = <T,>(arr: T[], key: (t: T) => string, nombre: (t: T) => string, sub: (t: T) => string | null, valor: (t: T) => number) => {
    const m = new Map<string, RankItem>()
    for (const it of arr) { const k = key(it); const g = m.get(k) ?? { nombre: nombre(it), sub: sub(it), casos: 0, valor: 0 }; g.casos++; g.valor += Math.abs(valor(it)); m.set(k, g) }
    return Array.from(m.values()).sort((a, b) => b.valor - a.valor).slice(0, 10)
  }

  const productos = acc(falt, (r) => r.sku, (r) => r.producto, (r) => r.sku, (r) => r.valor_diferencia)
  // sucursales: stock + caja + zonas
  const bySuc = new Map<string, RankItem>()
  for (const r of falt) { const g = bySuc.get(r.sucursal_id) ?? { nombre: r.sucursal, sub: 'stock', casos: 0, valor: 0 }; g.casos++; g.valor += Math.abs(r.valor_diferencia); bySuc.set(r.sucursal_id, g) }
  try {
    let qc = adm.from('arqueos_caja').select('sucursal_id, diferencia_cierre, sucursales(nombre)').neq('diferencia_cierre', 0)
    if (!f.esTodas && f.sucursalId) qc = qc.eq('sucursal_id', f.sucursalId)
    const { data: caja } = await qc
    for (const a of (caja ?? []) as any[]) { const g = bySuc.get(a.sucursal_id) ?? { nombre: a.sucursales?.nombre ?? '—', sub: null, casos: 0, valor: 0 }; g.casos++; g.valor += Math.abs(Number(a.diferencia_cierre)); bySuc.set(a.sucursal_id, g) }
  } catch { /* */ }
  const sucursales = Array.from(bySuc.values()).sort((a, b) => b.valor - a.valor).slice(0, 10)

  // zonas: de controles cerrados
  const zonas: RankItem[] = []
  try {
    let qz = adm.from('controles_zona').select('zona_id, valor_diferencia, n_diferencias, zonas(nombre), sucursales(nombre)').eq('estado', 'cerrado')
    if (!f.esTodas && f.sucursalId) qz = qz.eq('sucursal_id', f.sucursalId)
    const { data } = await qz
    const m = new Map<string, RankItem>()
    for (const c of (data ?? []) as any[]) { const g = m.get(c.zona_id) ?? { nombre: c.zonas?.nombre ?? '—', sub: c.sucursales?.nombre ?? null, casos: 0, valor: 0 }; g.casos += c.n_diferencias; g.valor += Math.abs(Number(c.valor_diferencia)); m.set(c.zona_id, g) }
    zonas.push(...Array.from(m.values()).sort((a, b) => b.valor - a.valor).slice(0, 10))
  } catch { /* */ }

  // cajeros: de arqueos con diferencia
  const cajeros: RankItem[] = []
  try {
    let qk = adm.from('arqueos_caja').select('cajero_nombre, diferencia_cierre').neq('diferencia_cierre', 0).not('cajero_nombre', 'is', null)
    if (!f.esTodas && f.sucursalId) qk = qk.eq('sucursal_id', f.sucursalId)
    const { data } = await qk
    const m = new Map<string, RankItem>()
    for (const a of (data ?? []) as any[]) { const g = m.get(a.cajero_nombre) ?? { nombre: a.cajero_nombre, sub: 'caja', casos: 0, valor: 0 }; g.casos++; g.valor += Math.abs(Number(a.diferencia_cierre)); m.set(a.cajero_nombre, g) }
    cajeros.push(...Array.from(m.values()).sort((a, b) => b.valor - a.valor).slice(0, 10))
  } catch { /* */ }

  return { productos, sucursales, zonas, cajeros }
}
