import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { getSucursalActiva } from '@/lib/sucursal/server'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'

import { AnalisisClient, type VendidoRow, type DormidoRow } from './analisis-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Análisis de ventas' }

export default async function AnalisisPage() {
  const profile = await requireAdminHubAccess()
  const sb = createClient()
  const { sucursalId, esTodas } = getSucursalActiva()
  const scope = <T,>(q: T): T => (esTodas || !sucursalId ? q : (q as any).eq('sucursal_id', sucursalId))
  const ahora = Date.now()
  const d90 = new Date(ahora - 90 * 86_400_000).toISOString()

  const [{ data: ventas }, { data: prods }, { data: stock }, { data: rot }, { data: sucs }] = await Promise.all([
    scope(sb.from('movimientos_stock').select('producto_id, sucursal_id, cantidad, fecha').eq('tipo', 'venta').gte('fecha', d90).limit(50000)),
    sb.from('productos_catalogo').select('id, sku, nombre, categoria, laboratorio, precio_sugerido, precio_costo_promedio').eq('activo', true),
    scope(sb.from('stock_items').select('producto_id, sucursal_id, cantidad')),
    scope(sb.from('producto_rotacion').select('producto_id, sucursal_id, ultima_venta, clasificacion_abc, dias_stock_restante')),
    sb.from('sucursales').select('id, nombre, codigo').eq('activa', true).order('nombre'),
  ])

  const prodMap = new Map(((prods ?? []) as any[]).map((p) => [p.id, p]))
  const dms = (n: number) => new Date(ahora - n * 86_400_000).toISOString()
  const d7 = dms(7), d30 = dms(30), d60 = dms(60)

  // Más vendidos: agregamos por producto (consolidado y por sucursal)
  type Acc = { u7: number; u30: number; u30prev: number; u90: number; porSuc: Record<string, number> }
  const acc = new Map<string, Acc>()
  for (const v of (ventas ?? []) as any[]) {
    const u = Math.abs(Number(v.cantidad))
    const a = acc.get(v.producto_id) ?? { u7: 0, u30: 0, u30prev: 0, u90: 0, porSuc: {} }
    a.u90 += u
    if (v.fecha >= d7) a.u7 += u
    if (v.fecha >= d30) a.u30 += u
    else if (v.fecha >= d60) a.u30prev += u
    a.porSuc[v.sucursal_id] = (a.porSuc[v.sucursal_id] ?? 0) + u
    acc.set(v.producto_id, a)
  }

  const masVendidos: VendidoRow[] = [...acc.entries()].map(([id, a]) => {
    const p = prodMap.get(id)
    const precio = Number(p?.precio_sugerido ?? p?.precio_costo_promedio ?? 0)
    const tendencia = a.u30prev > 0 ? Math.round(((a.u30 - a.u30prev) / a.u30prev) * 100) : (a.u30 > 0 ? 100 : 0)
    const abc = ((rot ?? []) as any[]).find((r) => r.producto_id === id)?.clasificacion_abc ?? null
    return {
      id, sku: p?.sku ?? null, nombre: p?.nombre ?? '—', categoria: p?.categoria ?? null, laboratorio: p?.laboratorio ?? null,
      u7: a.u7, u30: a.u30, u90: a.u90, facturacion30: Math.round(a.u30 * precio), tendencia, abc, porSuc: a.porSuc,
    }
  }).sort((x, y) => y.u30 - x.u30)

  // Dinero dormido: stock > 0 sin venta en 60d (o nunca), × costo
  const ventaReciente = new Set<string>()
  for (const v of (ventas ?? []) as any[]) if (v.fecha >= d60) ventaReciente.add(v.producto_id)
  const stockPorProd = new Map<string, number>()
  for (const s of (stock ?? []) as any[]) stockPorProd.set(s.producto_id, (stockPorProd.get(s.producto_id) ?? 0) + Number(s.cantidad))

  const dineroDormido: DormidoRow[] = [...stockPorProd.entries()]
    .filter(([id, cant]) => cant > 0 && !ventaReciente.has(id))
    .map(([id, cant]) => {
      const p = prodMap.get(id)
      const costo = Number(p?.precio_costo_promedio ?? 0)
      return { id, sku: p?.sku ?? null, nombre: p?.nombre ?? '—', categoria: p?.categoria ?? null, stock: cant, costo, inmovilizado: Math.round(cant * costo) }
    })
    .filter((d) => d.inmovilizado > 0)
    .sort((a, b) => b.inmovilizado - a.inmovilizado)

  return (
    <>
      <PageHeader title="Análisis de ventas" description="Más vendidos, rotación y dinero dormido por sucursal."
        breadcrumbs={[{ label: 'Operaciones' }, { label: 'Análisis' }]} />
      <div className="p-4 md:p-6">
        <AnalisisClient
          masVendidos={masVendidos}
          dineroDormido={dineroDormido}
          sucursales={((sucs ?? []) as any[]).map((s) => ({ id: s.id, nombre: s.nombre, codigo: s.codigo }))}
          totalInmovilizado={dineroDormido.reduce((a, d) => a + d.inmovilizado, 0)}
          hayVentas={(ventas ?? []).length > 0}
        />
      </div>
    </>
  )
}
