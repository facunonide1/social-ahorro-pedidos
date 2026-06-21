/**
 * Centro de Datos — motor de exportación (server). Toma una definición de
 * acción (entidad + filtros + columnas) y un perfil de formato (separador,
 * decimales, encabezado) y produce el archivo en el formato exacto que SIFACO
 * espera. Reutilizable por el futuro agente directo F20.
 */
import type { QueryDefinicion, ColumnaExport, OpcionesPerfil } from '@/lib/types/centro-datos'

type Adm = any

/** Registro normalizado: campos del sistema disponibles para exportar. */
type Registro = {
  sku?: string | null; nombre?: string | null; precio?: number | null
  stock?: number | null; rubro?: string | null; laboratorio?: string | null
  nom_promo?: string | null; def_promo?: string | null
  cantidad?: number | null; monto?: number | null; estado?: string | null
}

export type ResultadoExport = { registros: Registro[]; filas: Record<string, string | number>[]; csv: string }

/** Etiqueta legible de una oferta para DEF_PROMO. */
function defPromo(o: any): string {
  const v = Number(o.valor) || 0
  switch (o.tipo) {
    case 'descuento_pct': case 'porcentaje': return `${v}% OFF`
    case 'precio_fijo': case 'precio': return `Precio $${v}`
    case '2x1': return '2x1'
    case 'nxm': return `${o.nx ?? 2}x${o.ny ?? 1}`
    case 'segunda_unidad': return `2da unidad ${v}%`
    case 'por_cantidad': return 'Por cantidad'
    default: return o.nombre ?? 'Promo'
  }
}

/** Precio final de un producto bajo una oferta. */
function precioOferta(o: any, base: number | null): number | null {
  const v = Number(o.valor) || 0
  if (o.tipo === 'precio_fijo' || o.tipo === 'precio') return v
  if ((o.tipo === 'descuento_pct' || o.tipo === 'porcentaje') && base != null) return Math.round(base * (1 - v / 100) * 100) / 100
  return base
}

/** Trae y normaliza los registros según la entidad + filtros. */
export async function obtenerRegistros(adm: Adm, def: QueryDefinicion): Promise<Registro[]> {
  const f = def.filtros ?? {}

  if (def.entidad === 'productos') {
    let q = adm.from('productos_catalogo').select('sku, nombre, precio_sugerido, rubro, laboratorio, activo').limit(50000)
    if (f.solo_activos !== false) q = q.eq('activo', true)
    if (f.rubro) q = q.eq('rubro', f.rubro)
    const { data } = await q
    let regs = ((data ?? []) as any[]).map((p) => ({
      sku: p.sku, nombre: p.nombre, precio: p.precio_sugerido, rubro: p.rubro, laboratorio: p.laboratorio, estado: p.activo ? 'A' : 'B',
    }))
    if (f.sin_venta_dias) regs = await filtrarSinVenta(adm, regs, Number(f.sin_venta_dias))
    return regs
  }

  if (def.entidad === 'stock' || def.entidad === 'dif_stock') {
    let q = adm.from('stock_items').select('cantidad, sucursal_id, productos_catalogo(sku, nombre, rubro)').limit(80000)
    if (f.sucursal_id) q = q.eq('sucursal_id', f.sucursal_id)
    const { data } = await q
    // si no hay filtro de sucursal → consolidar (sumar) por CODIGO
    const porSku = new Map<string, Registro>()
    for (const s of (data ?? []) as any[]) {
      const pc = s.productos_catalogo
      if (!pc?.sku) continue
      const ex = porSku.get(pc.sku)
      const cant = Number(s.cantidad) || 0
      if (ex) ex.stock = (ex.stock ?? 0) + cant
      else porSku.set(pc.sku, { sku: pc.sku, nombre: pc.nombre, rubro: pc.rubro, stock: cant })
    }
    return Array.from(porSku.values())
  }

  if (def.entidad === 'ofertas') {
    const { data: ofertas } = await adm.from('ofertas').select('*').eq('estado', 'activa').limit(2000)
    const ids = Array.from(new Set(((ofertas ?? []) as any[]).flatMap((o) => o.productos_ids ?? [])))
    const catMap = new Map<string, any>()
    if (ids.length) {
      const { data: prods } = await adm.from('productos_catalogo').select('id, sku, nombre, precio_sugerido').in('id', ids)
      for (const p of (prods ?? []) as any[]) catMap.set(p.id, p)
    }
    const regs: Registro[] = []
    for (const o of (ofertas ?? []) as any[]) {
      for (const pid of (o.productos_ids ?? [])) {
        const p = catMap.get(pid)
        if (!p?.sku) continue
        regs.push({
          sku: p.sku, nombre: p.nombre, precio: precioOferta(o, p.precio_sugerido ?? null),
          nom_promo: o.nombre, def_promo: defPromo(o), estado: 'activa',
        })
      }
    }
    return regs
  }

  if (def.entidad === 'ventas') {
    const desde = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
    let q = adm.from('ventas_diarias').select('sku, descripcion, cantidad, monto, sucursal_id').gte('fecha', desde).limit(50000)
    if (f.sucursal_id) q = q.eq('sucursal_id', f.sucursal_id)
    const { data } = await q
    return ((data ?? []) as any[]).map((v) => ({ sku: v.sku, nombre: v.descripcion, cantidad: v.cantidad, monto: v.monto }))
  }

  return []
}

async function filtrarSinVenta(adm: Adm, regs: Registro[], dias: number): Promise<Registro[]> {
  const desde = new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10)
  const { data } = await adm.from('ventas_diarias').select('sku').gte('fecha', desde).limit(100000)
  const conVenta = new Set(((data ?? []) as any[]).map((v) => v.sku))
  return regs.filter((r) => r.sku && !conVenta.has(r.sku))
}

function fmtNum(n: number, decimales: ',' | '.'): string {
  const s = (Math.round(n * 100) / 100).toString()
  return decimales === ',' ? s.replace('.', ',') : s
}

function escapeCsv(v: string, sep: string): string {
  if (v.includes(sep) || v.includes('"') || v.includes('\n')) return `"${v.replace(/"/g, '""')}"`
  return v
}

/** Proyecta los registros a las columnas definidas y arma el CSV. */
export function construir(registros: Registro[], columnas: ColumnaExport[], opciones: OpcionesPerfil): ResultadoExport {
  const cols = [...columnas].sort((a, b) => a.orden - b.orden)
  const sep = (opciones.separador ?? ';') as string
  const dec = (opciones.decimales ?? '.') as ',' | '.'
  const conEnc = opciones.con_encabezado !== false

  const filas = registros.map((r) => {
    const fila: Record<string, string | number> = {}
    for (const c of cols) {
      const raw = (r as any)[c.campo]
      fila[c.header] = raw == null ? '' : raw
    }
    return fila
  })

  const lineas: string[] = []
  if (conEnc) lineas.push(cols.map((c) => escapeCsv(c.header, sep)).join(sep))
  for (const r of registros) {
    const campos = cols.map((c) => {
      const raw = (r as any)[c.campo]
      if (raw == null) return ''
      if (typeof raw === 'number') return fmtNum(raw, dec)
      return escapeCsv(String(raw), sep)
    })
    lineas.push(campos.join(sep))
  }
  return { registros, filas, csv: lineas.join('\r\n') }
}

/** Helper de alto nivel: definición + perfil → archivo. */
export async function generarExport(adm: Adm, def: QueryDefinicion, opciones: OpcionesPerfil): Promise<ResultadoExport> {
  const registros = await obtenerRegistros(adm, def)
  return construir(registros, def.columnas ?? [], opciones)
}
