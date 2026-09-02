import { Package, MapPin, Store, ClipboardList, PackageX, Truck } from 'lucide-react'

import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { getSucursalActiva } from '@/lib/sucursal/server'
import { SectorDashboard, type SectorKpi, type SectorAcceso } from '@/components/dashboard/sector-dashboard'
import { tituloDePantalla } from '@/lib/os/definicion'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Pedidos' }

const ABIERTOS = ['nuevo', 'confirmado', 'en_preparacion', 'listo', 'en_camino']

/**
 * EL SECTOR PEDIDOS.
 *
 * Los cuatro canales entran al mismo modelo (`orders.origin`) y se miran desde
 * acá. La sucursal es el eje: todo envío sale de una, y el ecommerce es una más.
 */
export default async function PedidosDashboard() {
  const titulo = await tituloDePantalla('pedidos', '/admin/pedidos', 'Pedidos')
  await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente', 'administrativo', 'sucursal', 'encargado_sucursal', 'cajero', 'auditor'],
  })
  const sb = createClient()
  const { sucursalId, esTodas } = getSucursalActiva()

  const desdeHoy = new Date(); desdeHoy.setHours(0, 0, 0, 0)

  let abiertosQ = sb.from('orders').select('id', { count: 'exact', head: true }).in('status', ABIERTOS)
  let entregadosQ = sb.from('orders').select('id', { count: 'exact', head: true })
    .eq('status', 'entregado').gte('delivered_at', desdeHoy.toISOString())
  if (!esTodas && sucursalId) {
    abiertosQ = abiertosQ.eq('sucursal_id', sucursalId)
    entregadosQ = entregadosQ.eq('sucursal_id', sucursalId)
  }

  const [{ count: abiertos }, { count: entregadosHoy }, { count: sinSucursal }, { data: canales }] =
    await Promise.all([
      abiertosQ,
      entregadosQ,
      sb.from('pedidos_sin_sucursal').select('id', { count: 'exact', head: true }),
      sb.from('canales_venta').select('id, nombre, sucursal_despacho_id'),
    ])

  const sinRegla = (canales ?? []).filter((c: any) => !c.sucursal_despacho_id).length

  const kpis: SectorKpi[] = [
    { label: 'Pedidos abiertos', value: abiertos ?? 0, icon: Package, href: '/admin/pedidos/tablero' },
    { label: 'Entregados hoy', value: entregadosHoy ?? 0, icon: Truck },
    {
      label: 'Sin sucursal asignada',
      value: sinSucursal ?? 0,
      icon: MapPin,
      variant: (sinSucursal ?? 0) > 0 ? 'warning' : 'default',
      href: '/admin/pedidos/tablero?sucursal=sin',
      footer: (sinSucursal ?? 0) > 0
        ? 'Entraron por un canal sin sucursal de despacho configurada.'
        : undefined,
    },
    // Cero canales con regla no es "cero": es que nadie la definió todavía. Un
    // 0 acá se leería como "no hace falta configurar nada".
    {
      label: 'Canales con sucursal de despacho',
      value: sinRegla === (canales ?? []).length ? null : (canales ?? []).length - sinRegla,
      icon: Store,
      nota: sinRegla === (canales ?? []).length
        ? 'Ningún canal tiene definido de qué sucursal despacha. Hay que elegirlo: no se puede deducir del stock.'
        : undefined,
    },
  ]

  const accesos: SectorAcceso[] = [
    { label: 'Tablero de pedidos', href: '/admin/pedidos/tablero', icon: ClipboardList, descripcion: 'Los cuatro canales por estado' },
    { label: 'Armar un pedido', href: '/admin/pedidos/nuevo', icon: Package, descripcion: 'WhatsApp, mostrador o PedidosYa' },
    { label: 'Envíos', href: '/admin/pedidos/envios', icon: Truck, descripcion: 'Zonas, tarifas y viajes' },
    { label: 'Reservas de stock', href: '/admin/pedidos/reservas', icon: PackageX, descripcion: 'Qué está bloqueado y hasta cuándo' },
  ]

  const nora = (sinSucursal ?? 0) > 0
    ? <p>Hay <b>{sinSucursal}</b> pedidos sin sucursal asignada. Entraron por un canal que todavía no tiene sucursal de despacho configurada — no lo puedo deducir del stock, porque el que tengo es el total de las cuatro sin abrir por local.</p>
    : <p>Hay <b>{abiertos ?? 0}</b> pedidos abiertos. Los cuatro canales entran al mismo modelo: WhatsApp y PedidosYa se cargan a mano, la tienda web entra sola por el webhook.</p>

  return (
    <SectorDashboard
      title={titulo}
      descripcion="WhatsApp, tienda web, PedidosYa y mostrador en un solo lugar. Todo envío sale de una sucursal."
      breadcrumbs={[{ label: 'Pedidos' }]}
      kpis={kpis}
      nora={nora}
      accesos={accesos}
    />
  )
}
