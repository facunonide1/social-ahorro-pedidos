import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { getSucursalActiva } from '@/lib/sucursal/server'
import { PageHeader } from '@/components/shared/page-header'
import { AccesoCentroDatos } from '@/components/centro-datos/acceso-centro-datos'

import { StockClient, type ProductoRow, type SucursalLite } from './stock-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Stock' }

export default async function StockPage() {
  const profile = await requireAdminHubAccess()
  const sb = createClient()
  const { sucursalId, esTodas } = getSucursalActiva()

  const en30d = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)

  let stockQ = sb.from('stock_items').select('producto_id, sucursal_id, cantidad, cantidad_gondola, cantidad_deposito, stock_minimo, stock_maximo')
  let rotQ = sb.from('producto_rotacion').select('producto_id, sucursal_id, venta_diaria_prom_30d, dias_stock_restante, clasificacion_abc')
  let lotesQ = sb.from('lotes_productos').select('producto_id').gt('cantidad_actual', 0).lte('fecha_vencimiento', en30d)
  if (!esTodas && sucursalId) { stockQ = stockQ.eq('sucursal_id', sucursalId); rotQ = rotQ.eq('sucursal_id', sucursalId); lotesQ = lotesQ.eq('sucursal_id', sucursalId) }

  const [{ data: prods }, { data: stock }, { data: rot }, { data: sucs }, { data: lotesVenc }] =
    await Promise.all([
      sb.from('productos_catalogo').select('id, sku, codigo_barras, nombre, laboratorio, categoria, precio_costo_promedio, precio_sugerido, es_controlado, lista_controlado, bloqueado_recall').eq('activo', true).order('nombre').limit(5000),
      stockQ,
      rotQ,
      sb.from('sucursales').select('id, nombre, codigo, usa_deposito').eq('activa', true).order('nombre'),
      lotesQ,
    ])

  const sucursales = ((sucs ?? []) as any[]).map((s) => ({ id: s.id, nombre: s.nombre, codigo: s.codigo, usaDeposito: !!s.usa_deposito })) as SucursalLite[]
  const stockItems = (stock ?? []) as any[]
  const rotItems = (rot ?? []) as any[]
  const porVencer = new Set(((lotesVenc ?? []) as any[]).map((l) => l.producto_id))

  const stockByProd = new Map<string, Record<string, { cantidad: number; gondola: number; deposito: number; min: number; max: number | null }>>()
  for (const s of stockItems) {
    const m = stockByProd.get(s.producto_id) ?? {}
    m[s.sucursal_id] = { cantidad: Number(s.cantidad), gondola: Number(s.cantidad_gondola ?? 0), deposito: Number(s.cantidad_deposito ?? 0), min: Number(s.stock_minimo), max: s.stock_maximo == null ? null : Number(s.stock_maximo) }
    stockByProd.set(s.producto_id, m)
  }
  const ventaByProd = new Map<string, number>()
  const abcByProd = new Map<string, string | null>()
  for (const r of rotItems) {
    ventaByProd.set(r.producto_id, (ventaByProd.get(r.producto_id) ?? 0) + Number(r.venta_diaria_prom_30d ?? 0))
    if (r.clasificacion_abc) abcByProd.set(r.producto_id, r.clasificacion_abc)
  }

  const productos: ProductoRow[] = ((prods ?? []) as any[]).map((p) => {
    const porSuc = stockByProd.get(p.id) ?? {}
    const total = Object.values(porSuc).reduce((a, s) => a + s.cantidad, 0)
    const totalGondola = Object.values(porSuc).reduce((a, s) => a + s.gondola, 0)
    const totalDeposito = Object.values(porSuc).reduce((a, s) => a + s.deposito, 0)
    const ventaDia = ventaByProd.get(p.id) ?? 0
    const cobertura = ventaDia > 0 ? Math.round((total / ventaDia) * 10) / 10 : null
    const critico = sucursales.some((s) => { const x = porSuc[s.id]; return x && x.cantidad <= x.min })
    const costo = Number(p.precio_costo_promedio ?? 0)
    return {
      id: p.id, sku: p.sku, ean: p.codigo_barras, nombre: p.nombre, laboratorio: p.laboratorio,
      categoria: p.categoria, costo, total, totalGondola, totalDeposito, ventaDia, cobertura, critico,
      sinRotacion: ventaDia === 0, porVencer: porVencer.has(p.id), abc: abcByProd.get(p.id) ?? null,
      controlado: !!p.es_controlado, listaControlado: p.lista_controlado ?? null, recall: !!p.bloqueado_recall,
      stockPorSuc: porSuc,
    }
  })

  const valorStock = productos.reduce((a, p) => a + p.total * p.costo, 0)
  const criticos = productos.filter((p) => p.critico).length

  return (
    <>
      <PageHeader
        title="Stock"
        description="Existencias por sucursal con semáforo, rotación y cobertura."
        breadcrumbs={[{ label: 'Operaciones' }, { label: 'Stock' }]}
        actions={
          <div className="flex gap-2">
            <AccesoCentroDatos accion={{ tipo: 'importar-stock' }} />
            <AccesoCentroDatos accion={{ tipo: 'exportar-dif-stock' }} />
          </div>
        }
      />
      <div className="p-4 md:p-6">
        <StockClient
          productos={productos}
          sucursales={sucursales}
          kpis={{ productos: productos.length, valorStock, criticos, porVencer: porVencer.size }}
          rol={profile.rol}
        />
      </div>
    </>
  )
}
