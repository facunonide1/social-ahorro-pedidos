import { Boxes, AlertTriangle, CalendarClock, Bell, ArrowRightLeft, ClipboardCheck, TrendingUp, Upload, PackageX, FileSpreadsheet } from 'lucide-react'

import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { getSucursalActiva } from '@/lib/sucursal/server'
import { formatARS } from '@/lib/utils/format'
import { SectorDashboard, type SectorKpi, type SectorAcceso } from '@/components/dashboard/sector-dashboard'
import { AccionesSubApp } from '@/components/os/acciones-subapp'
import { tituloDePantalla } from '@/lib/os/definicion'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Operaciones' }

export default async function OperacionesDashboard() {
  // Puede venir de la declaración de la fábrica. Si el lector está apagado
  // o algo falla, devuelve este mismo texto: la pantalla no cambia.
  const tituloDeclarado = await tituloDePantalla('stock', '/admin/operaciones', 'Operaciones')

  await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'comprador', 'administrativo', 'sucursal', 'auditor'] })
  const sb = createClient()
  const { sucursalId, esTodas } = getSucursalActiva()
  const en30 = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)
  const hoy = new Date().toISOString().slice(0, 10)

  let itemsQ = sb.from('stock_items').select('producto_id, cantidad, stock_minimo').limit(20000)
  let lotesQ = sb.from('lotes_productos').select('id', { count: 'exact', head: false }).gt('cantidad_actual', 0).lte('fecha_vencimiento', en30).gte('fecha_vencimiento', hoy).limit(5000)
  let alertasQ = sb.from('alertas_stock').select('id', { count: 'exact', head: true }).eq('estado', 'activa')
  if (!esTodas && sucursalId) { itemsQ = itemsQ.eq('sucursal_id', sucursalId); lotesQ = lotesQ.eq('sucursal_id', sucursalId); alertasQ = alertasQ.eq('sucursal_id', sucursalId) }

  const [{ data: items }, { data: valor }, { data: lotes }, { count: alertas }] = await Promise.all([
    itemsQ,
    // El valor de stock se suma EN LA BASE. Antes se traian 46.129 productos
    // para armar un Map de costos y PostgREST devolvia mil: el total salia
    // calculado sobre el 2% del catalogo, sin ninguna senal (v0.85).
    sb.rpc('catalogo_valor_de_stock'),
    lotesQ,
    alertasQ,
  ])

  const its = (items ?? []) as any[]
  const valorStock = Number((valor as any)?.[0]?.valor_costo ?? 0)
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
    { label: 'Conteos por zona', href: '/admin/operaciones/conteos', icon: ClipboardCheck },
    { label: 'Alertas', href: '/admin/operaciones/alertas', icon: Bell },
    { label: 'Análisis', href: '/admin/operaciones/analisis', icon: TrendingUp, descripcion: 'Más vendidos · dinero dormido' },
    { label: 'Reposición', href: '/admin/operaciones/reposicion', icon: PackageX },
    { label: 'Importaciones', href: '/admin/operaciones/importaciones', icon: Upload },
    // Distinta de la de arriba: aquélla es el Excel diario por sucursal, ésta
    // es el maestro completo de productos, de donde sale el catálogo.
    { label: 'Maestro de SIFACO', href: '/admin/operaciones/sifaco', icon: FileSpreadsheet, descripcion: 'El archivo completo de productos' },
  ]

  const nora = quiebres > 0
    ? <p>Hay <b>{quiebres}</b> productos en quiebre o bajo el mínimo. Revisá reposición para no perder ventas. {porVencer > 0 && <>Además <b>{porVencer}</b> lotes vencen en 30 días.</>}</p>
    : porVencer > 0
    ? <p><b>{porVencer}</b> lotes vencen en los próximos 30 días — planificá liquidación o devolución. Valor de stock actual: <b>{formatARS(valorStock)}</b>.</p>
    : <p>Operación al día. Valor de stock: <b>{formatARS(valorStock)}</b>, sin quiebres ni vencimientos próximos.</p>

  return (
    <SectorDashboard
      title={tituloDeclarado}
      descripcion="Stock, inventario y logística de las sucursales."
      breadcrumbs={[{ label: 'Operaciones' }]}
      kpis={kpis}
      nora={nora}
      accesos={accesos}
      acciones={<AccionesSubApp app="stock" />}
    />
  )
}
