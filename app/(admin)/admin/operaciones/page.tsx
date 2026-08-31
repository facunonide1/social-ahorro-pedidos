import { Boxes, AlertTriangle, CalendarClock, Bell, ArrowRightLeft, ClipboardCheck, TrendingUp, Upload, PackageX, FileSpreadsheet } from 'lucide-react'

import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { getSucursalActiva } from '@/lib/sucursal/server'
import { estadoDelStock, contarQuiebres } from '@/lib/stock/fuente'
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

  // ── UNA FUENTE POR NUMERO, Y DICHA ────────────────────────────────────────
  //
  // Este panel mezclaba dos fuentes de stock: sacaba el VALOR de
  // producto_stock_sifaco —real— y los QUIEBRES de stock_items —480 filas, las
  // 480 de demostracion—. Mostraba "$0 de stock" y "56 quiebres" al mismo
  // tiempo, y NORA escribia un parrafo afirmando los 56.
  //
  // Los 56 existian como filas. El hecho no: no habia 56 productos en quiebre.
  //
  // Ahora los dos numeros salen del mismo lugar (lib/stock/fuente.ts), los
  // quiebres se cuentan EN LA BASE y solo sobre stock real, y cuando no se
  // pueden calcular devuelven null — que la pantalla muestra como "sin datos",
  // no como cero (v0.85).
  let lotesQ = sb.from('lotes_productos').select('id', { count: 'exact', head: true }).gt('cantidad_actual', 0).lte('fecha_vencimiento', en30).gte('fecha_vencimiento', hoy)
  let alertasQ = sb.from('alertas_stock').select('id', { count: 'exact', head: true }).eq('estado', 'activa').eq('es_demo', false)
  if (!esTodas && sucursalId) { lotesQ = lotesQ.eq('sucursal_id', sucursalId); alertasQ = alertasQ.eq('sucursal_id', sucursalId) }

  const [estado, quiebres, { count: lotes }, { count: alertas }] = await Promise.all([
    estadoDelStock(),
    contarQuiebres(esTodas ? null : sucursalId),
    lotesQ,
    alertasQ,
  ])

  const valorStock = estado.sifaco.valorCosto
  const porVencer = lotes ?? 0

  const kpis: SectorKpi[] = [
    { label: 'Valor de stock', value: valorStock, format: 'currency', icon: Boxes, href: '/admin/operaciones/stock',
      nota: 'Total que declara SIFACO, sin abrir por sucursal' },
    // `quiebres` es null cuando no hay stock real por sucursal. Cero seria
    // "lo mire y no hay"; null es "no lo puedo saber", y son cosas distintas.
    { label: 'Quiebres / bajo mínimo', value: quiebres, icon: PackageX,
      variant: (quiebres ?? 0) > 0 ? 'danger' : 'default',
      href: '/admin/operaciones/stock?filtro=critico',
      nota: quiebres === null ? estado.motivoSinDatos ?? 'sin stock por sucursal' : undefined },
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
    { label: 'Lo que está roto', href: '/admin/operaciones/anomalias', icon: AlertTriangle, descripcion: 'Descuentos, duplicados y costos que faltan' },
  ]

  // NORA no afirma sobre lo que no puede saber. Si no hay stock por sucursal,
  // lo dice — no dice "operacion al dia", que con datos de demostracion adentro
  // es una afirmacion sobre nada.
  const nora = quiebres === null
    ? <p>No puedo hablar de quiebres todavía: <b>{estado.motivoSinDatos}</b> Lo que sí sé es que SIFACO declara <b>{estado.sifaco.unidades.toLocaleString('es-AR')} unidades</b> en {estado.sifaco.productosConStock.toLocaleString('es-AR')} productos, por <b>{formatARS(valorStock)}</b> a costo.</p>
    : quiebres > 0
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
