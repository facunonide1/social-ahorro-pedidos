import { Boxes, AlertTriangle, CalendarClock, Bell, ArrowRightLeft, ClipboardCheck, TrendingUp, Upload, PackageX } from 'lucide-react'

import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { getSucursalActiva } from '@/lib/sucursal/server'
import { formatARS } from '@/lib/utils/format'
import { SectorDashboard, type SectorKpi, type SectorAcceso } from '@/components/dashboard/sector-dashboard'
import { AccionesSubApp } from '@/components/os/acciones-subapp'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Operaciones' }

export default async function OperacionesDashboard() {
  await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'comprador', 'administrativo', 'sucursal', 'auditor'] })
  const sb = createClient()
  const { sucursalId, esTodas } = getSucursalActiva()
  const en30 = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)
  const hoy = new Date().toISOString().slice(0, 10)

  let itemsQ = sb.from('stock_items').select('producto_id, cantidad, stock_minimo').limit(20000)
  let lotesQ = sb.from('lotes_productos').select('id', { count: 'exact', head: false }).gt('cantidad_actual', 0).lte('fecha_vencimiento', en30).gte('fecha_vencimiento', hoy).limit(5000)
  let alertasQ = sb.from('alertas_stock').select('id', { count: 'exact', head: true }).eq('estado', 'activa')
  if (!esTodas && sucursalId) { itemsQ = itemsQ.eq('sucursal_id', sucursalId); lotesQ = lotesQ.eq('sucursal_id', sucursalId); alertasQ = alertasQ.eq('sucursal_id', sucursalId) }

  const [{ data: items }, { data: prods }, { data: lotes }, { count: alertas }] = await Promise.all([
    itemsQ,
    sb.from('productos_catalogo').select('id, precio_costo_promedio').limit(20000),
    lotesQ,
    alertasQ,
  ])

  const costo = new Map(((prods ?? []) as any[]).map((p) => [p.id, Number(p.precio_costo_promedio ?? 0)]))
  const its = (items ?? []) as any[]
  const valorStock = its.reduce((a, s) => a + Number(s.cantidad) * (costo.get(s.producto_id) ?? 0), 0)
  const quiebres = its.filter((s) => Number(s.stock_minimo) > 0 && Number(s.cantidad) <= Number(s.stock_minimo)).length
  const porVencer = (lotes ?? []).length

  const kpis: SectorKpi[] = [
    { label: 'Valor de stock', value: valorStock, format: 'currency', icon: Boxes, href: '/admin/operaciones/stock' },
    { label: 'Quiebres / bajo mínimo', value: quiebres, icon: PackageX, variant: quiebres > 0 ? 'danger' : 'default', href: '/admin/operaciones/stock?filtro=critico' },
    { label: 'Por vencer (30 días)', value: porVencer, icon: CalendarClock, variant: porVencer > 0 ? 'warning' : 'default', href: '/admin/operaciones/vencimientos' },
    { label: 'Alertas activas', value: alertas ?? 0, icon: Bell, variant: (alertas ?? 0) > 0 ? 'warning' : 'default', href: '/admin/operaciones/alertas' },
  ]

  const accesos: SectorAcceso[] = [
    { label: 'Stock e inventario', href: '/admin/operaciones/stock', icon: Boxes, descripcion: 'Semáforo + kárdex' },
    { label: 'Vencimientos', href: '/admin/operaciones/vencimientos', icon: CalendarClock },
    { label: 'Transferencias', href: '/admin/operaciones/transferencias', icon: ArrowRightLeft },
    { label: 'Inventarios', href: '/admin/operaciones/inventarios', icon: ClipboardCheck },
    { label: 'Alertas', href: '/admin/operaciones/alertas', icon: Bell },
    { label: 'Análisis', href: '/admin/operaciones/analisis', icon: TrendingUp, descripcion: 'Más vendidos · dinero dormido' },
    { label: 'Reposición', href: '/admin/operaciones/reposicion', icon: PackageX },
    { label: 'Importaciones', href: '/admin/operaciones/importaciones', icon: Upload },
  ]

  const nora = quiebres > 0
    ? <p>Hay <b>{quiebres}</b> productos en quiebre o bajo el mínimo. Revisá reposición para no perder ventas. {porVencer > 0 && <>Además <b>{porVencer}</b> lotes vencen en 30 días.</>}</p>
    : porVencer > 0
    ? <p><b>{porVencer}</b> lotes vencen en los próximos 30 días — planificá liquidación o devolución. Valor de stock actual: <b>{formatARS(valorStock)}</b>.</p>
    : <p>Operación al día. Valor de stock: <b>{formatARS(valorStock)}</b>, sin quiebres ni vencimientos próximos.</p>

  return (
    <SectorDashboard
      title="Operaciones"
      descripcion="Stock, inventario y logística de las sucursales."
      breadcrumbs={[{ label: 'Operaciones' }]}
      kpis={kpis}
      nora={nora}
      accesos={accesos}
      acciones={<AccionesSubApp app="stock" />}
    />
  )
}
