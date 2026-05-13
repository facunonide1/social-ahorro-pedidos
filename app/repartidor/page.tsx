import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ExternalLink, Map, MapPin, Phone, Route } from 'lucide-react'

import { createClient } from '@/lib/supabase/server'
import type { Order, UserPedidos } from '@/lib/types'
import { formatAddress, googleMapsLink } from '@/lib/address'
import { formatOrderNumber } from '@/lib/orders/format'

import { CrmShell } from '@/components/crm/crm-shell'
import { OrderStatusBadge } from '@/components/crm/order-status-badge'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

import RepartidorRowActions from './row-actions'

export const dynamic = 'force-dynamic'

type OrderWithZona = Order & {
  zonas_reparto: { id: string; nombre: string; color: string } | null
}

export default async function RepartidorPage() {
  const sb = createClient()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await sb
    .from('users_pedidos')
    .select('id, email, name, role, active')
    .eq('id', user.id)
    .maybeSingle<UserPedidos>()

  if (!profile?.active) redirect('/logout?reason=sin_permiso')
  if (profile.role !== 'repartidor') redirect('/dashboard')

  const { data: orders } = await sb
    .from('orders')
    .select('*, zonas_reparto(id, nombre, color)')
    .eq('assigned_to', profile.id)
    .order('created_at', { ascending: false })

  const prioridad: Record<string, number> = {
    en_camino: 0,
    listo: 1,
    en_preparacion: 2,
    confirmado: 3,
    nuevo: 4,
    entregado: 5,
    cancelado: 6,
  }
  const sorted = ((orders ?? []) as OrderWithZona[])
    .slice()
    .sort((a, b) => (prioridad[a.status] ?? 99) - (prioridad[b.status] ?? 99))

  const pendientes = sorted.filter(
    (o) => o.status !== 'entregado' && o.status !== 'cancelado',
  )
  const cerrados = sorted.filter(
    (o) => o.status === 'entregado' || o.status === 'cancelado',
  )

  type Group = {
    zonaId: string | null
    nombre: string
    color: string
    orders: OrderWithZona[]
  }
  const groups = new Map<string, Group>()
  for (const o of pendientes) {
    const zid = o.zona_id ?? 'sin-zona'
    if (!groups.has(zid)) {
      groups.set(zid, {
        zonaId: o.zona_id ?? null,
        nombre: o.zonas_reparto?.nombre ?? 'Sin zona asignada',
        color: o.zonas_reparto?.color ?? 'hsl(var(--muted-foreground))',
        orders: [],
      })
    }
    groups.get(zid)!.orders.push(o)
  }
  const groupsList = Array.from(groups.values()).sort(
    (a, b) => b.orders.length - a.orders.length,
  )

  function buildRouteLink(list: OrderWithZona[]): string | null {
    const stops = list
      .map((o) => formatAddress(o.shipping_address) || formatAddress(o.billing_address))
      .filter(Boolean) as string[]
    if (stops.length === 0) return null
    const last = stops[stops.length - 1]
    const waypoints = stops.slice(0, -1).join('|')
    const params = new URLSearchParams({ api: '1', destination: last })
    if (waypoints) params.set('waypoints', waypoints)
    return `https://www.google.com/maps/dir/?${params}`
  }

  const totalRouteLink = buildRouteLink(pendientes)

  return (
    <CrmShell>
      <PageHeader
        title="Mis entregas"
        description={
          <>
            {profile.name || profile.email} · {pendientes.length} pendiente
            {pendientes.length === 1 ? '' : 's'}
          </>
        }
      />

      <div className="mx-auto w-full max-w-2xl space-y-3 p-4">
        {totalRouteLink && (
          <Button asChild size="lg" className="w-full">
            <a href={totalRouteLink} target="_blank" rel="noreferrer">
              <Route className="size-5" />
              Abrir ruta completa en Google Maps ({pendientes.length} paradas)
            </a>
          </Button>
        )}

        {pendientes.length === 0 && cerrados.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No tenés entregas asignadas.
            </CardContent>
          </Card>
        )}

        {groupsList.map((g) => {
          const routeLink = buildRouteLink(g.orders)
          return (
            <div key={g.zonaId ?? 'sin-zona'} className="flex flex-col gap-2">
              <div className="flex items-center gap-2.5 rounded-md border border-border bg-card px-3 py-2.5">
                <span
                  className="size-3 shrink-0 rounded-full"
                  style={{ background: g.color }}
                  aria-hidden
                />
                <span className="text-sm font-bold">{g.nombre}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {g.orders.length} pedido{g.orders.length === 1 ? '' : 's'}
                </span>
                {routeLink && (
                  <Button asChild variant="ghost" size="sm">
                    <a href={routeLink} target="_blank" rel="noreferrer">
                      <Map className="size-3.5" />
                      Ruta
                    </a>
                  </Button>
                )}
              </div>
              {g.orders.map((o) => (
                <DeliveryCard key={o.id} order={o} />
              ))}
            </div>
          )
        })}

        {cerrados.length > 0 && (
          <div className="mt-4 space-y-2">
            <div className="px-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Cerrados
            </div>
            {cerrados.map((o) => (
              <DeliveryCard key={o.id} order={o} compact />
            ))}
          </div>
        )}
      </div>
    </CrmShell>
  )
}

function DeliveryCard({
  order,
  compact = false,
}: {
  order: OrderWithZona
  compact?: boolean
}) {
  const addr =
    formatAddress(order.shipping_address) || formatAddress(order.billing_address)
  const maps =
    googleMapsLink(order.shipping_address) || googleMapsLink(order.billing_address)

  return (
    <Card className={cn(compact && 'opacity-70')}>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-base font-bold">{order.customer_name || '—'}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {formatOrderNumber(order)} · ${Number(order.total).toLocaleString('es-AR')}
            </div>
          </div>
          <OrderStatusBadge status={order.status} />
        </div>

        {addr && (
          <div className="flex gap-1.5 text-sm leading-relaxed">
            <MapPin className="size-4 shrink-0 text-muted-foreground" />
            {addr}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {maps && (
            <Button asChild className="h-12 flex-1">
              <a href={maps} target="_blank" rel="noreferrer">
                <Map className="size-4" />
                Google Maps
              </a>
            </Button>
          )}
          {order.customer_phone && (
            <Button asChild variant="secondary" className="h-12 flex-1">
              <a href={`tel:${order.customer_phone}`}>
                <Phone className="size-4" />
                Llamar
              </a>
            </Button>
          )}
          <Button asChild variant="outline" className="h-12 flex-1">
            <Link href={`/pedidos/${order.id}`}>
              <ExternalLink className="size-4" />
              Detalle
            </Link>
          </Button>
        </div>

        {!compact && <RepartidorRowActions order={order} />}
      </CardContent>
    </Card>
  )
}
