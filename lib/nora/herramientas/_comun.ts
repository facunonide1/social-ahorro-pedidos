/** Helpers compartidos entre herramientas de NORA (búsquedas reales, formato). */
import type { Opcion, NoraCtx } from './tipos'

export const money = (n: number) => `$${Math.round(Number(n) || 0).toLocaleString('es-AR')}`

/** Productos por nombre / SKU / código de barras (misma fuente que la UI). */
export async function buscarProductos(adm: any, term: string): Promise<Opcion[]> {
  const q = String(term ?? '').trim()
  if (q.length < 2) return []
  const like = `%${q.replace(/[%,]/g, ' ')}%`
  const { data } = await adm.from('productos_catalogo')
    .select('id, nombre, sku, codigo_barras, precio_costo_promedio')
    .eq('activo', true)
    .or(`sku.ilike.${like},nombre.ilike.${like},codigo_barras.ilike.${like}`)
    .order('nombre').limit(12)
  return ((data ?? []) as any[]).map((p) => ({ valor: p.id, label: p.nombre, sub: p.sku ? `SKU ${p.sku}` : undefined }))
}

/** Proveedores activos por razón social. */
export async function buscarProveedores(adm: any, term?: string): Promise<Opcion[]> {
  let q = adm.from('proveedores').select('id, razon_social').eq('activo', true).order('razon_social').limit(20)
  const t = String(term ?? '').trim()
  if (t.length >= 2) q = adm.from('proveedores').select('id, razon_social').eq('activo', true).ilike('razon_social', `%${t.replace(/[%,]/g, ' ')}%`).order('razon_social').limit(20)
  const { data } = await q
  return ((data ?? []) as any[]).map((p) => ({ valor: p.id, label: p.razon_social }))
}

/** Sucursales activas. */
export async function sucursalesOpciones(adm: any): Promise<Opcion[]> {
  const { data } = await adm.from('sucursales').select('id, nombre').eq('activa', true).order('nombre')
  return ((data ?? []) as any[]).map((s) => ({ valor: s.id, label: s.nombre }))
}

/** La sucursal de contexto como default (o null si "todas"). */
export function sucursalDefault(ctx: NoraCtx): string | null {
  return ctx.esTodas ? null : ctx.sucursalId
}

/** Parsea una fecha en dd/mm/yyyy, dd-mm-yyyy o ISO → YYYY-MM-DD (o null). */
export function parseFecha(v: any): string | null {
  const s = String(v ?? '').trim()
  if (!s) return null
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/)
  if (m) {
    const d = m[1].padStart(2, '0'), mo = m[2].padStart(2, '0')
    const y = m[3].length === 2 ? `20${m[3]}` : m[3]
    return `${y}-${mo}-${d}`
  }
  const t = Date.parse(s)
  if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10)
  return null
}
