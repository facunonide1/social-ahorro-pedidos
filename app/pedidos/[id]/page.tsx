import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle, Copy, ExternalLink, Printer } from 'lucide-react'

import { createClient } from '@/lib/supabase/server'
import { ORIGIN_LABELS } from '@/lib/types'
import type {
  Order,
  UserPedidos,
  OrderStatusHistory,
  ZonaReparto,
  WhatsappMessage,
  OrderIncident,
  Customer,
} from '@/lib/types'
import { formatAddress, googleMapsLink } from '@/lib/address'
import { formatOrderNumber } from '@/lib/orders/format'
import { minutesBetween, formatDuration } from '@/lib/orders/timing'

import { CrmShell } from '@/components/crm/crm-shell'
import { OrderStatusBadge } from '@/components/crm/order-status-badge'
import { OrderTipoEnvioBadge } from '@/components/crm/order-tipo-envio-badge'
import { PageHeader } from '@/components/shared/page-header'
import { PageActions } from '@/components/shared/page-actions'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

import OrderActions from './actions'
import WooSyncBanner from './woo-sync-banner'
import WhatsappMessagesList from './whatsapp-messages'
import IncidentsSection from './incidents'
import ItemsEditor from './items-editor'
import DeliveryProof from './delivery-proof'

export const dynamic = 'force-dynamic'

export default async function OrderDetailPage({ params }: { params: { id: string } }) {
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

  const { data: order } = await sb
    .from('orders')
    .select('*')
    .eq('id', params.id)
    .maybeSingle<Order>()

  if (!order) notFound()

  const { data: history } = await sb
    .from('order_status_history')
    .select('*')
    .eq('order_id', order.id)
    .order('created_at', { ascending: false })

  const { data: messages } = await sb
    .from('whatsapp_messages')
    .select('*')
    .eq('order_id', order.id)
    .order('created_at', { ascending: false })
    .returns<WhatsappMessage[]>()

  const { data: incidents } = await sb
    .from('order_incidents')
    .select('*')
    .eq('order_id', order.id)
    .order('created_at', { ascending: false })
    .returns<OrderIncident[]>()

  const { data: customer } = order.customer_id
    ? await sb.from('customers').select('*').eq('id', order.customer_id).maybeSingle<Customer>()
    : { data: null }
  const { count: customerOrdersCount } = order.customer_id
    ? await sb
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('customer_id', order.customer_id)
    : { count: null }

  const { data: repartidores } =
    profile.role === 'admin' || profile.role === 'operador'
      ? await sb
          .from('users_pedidos')
          .select('id, name, email, role, active')
          .eq('role', 'repartidor')
          .eq('active', true)
      : { data: [] as Pick<UserPedidos, 'id' | 'name' | 'email' | 'role' | 'active'>[] }

  let suggestedRepartidorId: string | null = null
  if (order.zona_id && (profile.role === 'admin' || profile.role === 'operador')) {
    const { data: historico } = await sb
      .from('orders')
      .select('assigned_to')
      .eq('zona_id', order.zona_id)
      .eq('status', 'entregado')
      .not('assigned_to', 'is', null)
      .order('created_at', { ascending: false })
      .limit(30)
    const counts = new Map<string, number>()
    for (const r of historico ?? []) {
      if (!r.assigned_to) continue
      counts.set(r.assigned_to, (counts.get(r.assigned_to) ?? 0) + 1)
    }
    let max = 0
    for (const [id, n] of counts) {
      if (n > max) {
        max = n
        suggestedRepartidorId = id
      }
    }
  }

  const { data: zonas } =
    profile.role === 'admin' || profile.role === 'operador'
      ? await sb
          .from('zonas_reparto')
          .select('id, nombre, color, activa')
          .order('activa', { ascending: false })
          .order('nombre', { ascending: true })
      : { data: [] as Pick<ZonaReparto, 'id' | 'nombre' | 'color' | 'activa'>[] }

  const userIds = Array.from(
    new Set(
      [
        ...(history ?? []).map((h) => h.changed_by),
        ...(messages ?? []).map((m) => m.sent_by),
        ...(incidents ?? []).map((i) => i.registrado_by),
      ].filter(Boolean),
    ),
  ) as string[]

  const { data: changers } = userIds.length
    ? await sb.from('users_pedidos').select('id, name, email').in('id', userIds)
    : { data: [] as Pick<UserPedidos, 'id' | 'name' | 'email'>[] }

  const changerMap = new Map((changers ?? []).map((c) => [c.id, c.name || c.email]))

  const shipping = order.shipping_address
  const mapsLink = googleMapsLink(shipping)
  const addressStr = formatAddress(shipping) || formatAddress(order.billing_address)

  const backHref = profile.role === 'repartidor' ? '/repartidor' : '/pedidos'

  const customerBadge = (() => {
    if (customerOrdersCount === null || customerOrdersCount === undefined) return null
    if (customerOrdersCount >= 10)
      return (
        <Badge variant="warning" className="text-[10px] uppercase tracking-wide">
          VIP · {customerOrdersCount} pedidos
        </Badge>
      )
    if (customerOrdersCount >= 2)
      return (
        <Badge variant="info" className="text-[10px] uppercase tracking-wide">
          Recurrente · {customerOrdersCount} pedidos
        </Badge>
      )
    if (customerOrdersCount === 1)
      return (
        <Badge variant="success" className="text-[10px] uppercase tracking-wide">
          Primera compra
        </Badge>
      )
    return null
  })()

  return (
    <CrmShell>
      <PageHeader
        title={`Pedido ${formatOrderNumber(order)}`}
        description={
          <>
            {ORIGIN_LABELS[order.origin]} ·{' '}
            {order.woo_created_at
              ? new Date(order.woo_created_at).toLocaleString('es-AR')
              : new Date(order.created_at).toLocaleString('es-AR')}
          </>
        }
        breadcrumbs={[
          { label: 'Pedidos', href: backHref },
          { label: formatOrderNumber(order) },
        ]}
        actions={
          <PageActions>
            <OrderStatusBadge status={order.status} />
            <OrderTipoEnvioBadge tipo={order.tipo_envio} status={order.status} />
            {order.fuera_de_horario && (
              <Badge variant="warning" className="text-[10px] uppercase tracking-wide">
                Fuera de horario
              </Badge>
            )}
            {(incidents ?? []).length > 0 && (
              <Badge variant="destructive" className="text-[10px] uppercase tracking-wide">
                Incidencia
              </Badge>
            )}
            {(profile.role === 'admin' || profile.role === 'operador') && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/pedidos/nuevo?from=${order.id}`}>
                  <Copy className="size-4" />
                  Repetir
                </Link>
              </Button>
            )}
            <Button asChild variant="outline" size="sm">
              <Link href={`/pedidos/${order.id}/remito`}>
                <Printer className="size-4" />
                Remito
              </Link>
            </Button>
          </PageActions>
        }
      />

      <div className="mx-auto w-full max-w-4xl space-y-4 p-4 md:p-6">
        <WooSyncBanner order={order} />

        {customer?.tags?.includes('blacklist') && (
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertTitle>Cliente en lista negra</AlertTitle>
            <AlertDescription>
              {customer.notes && (
                <p className="mt-1 whitespace-pre-wrap">{customer.notes}</p>
              )}
              <Link
                href={`/clientes/${customer.id}`}
                className="mt-2 inline-flex items-center gap-1 text-sm font-semibold underline"
              >
                Ver ficha del cliente
                <ExternalLink className="size-3.5" />
              </Link>
            </AlertDescription>
          </Alert>
        )}

        {/* CLIENTE + DIRECCIÓN */}
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
            <div>
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Cliente
              </CardTitle>
            </div>
            {order.customer_id && (
              <Button asChild variant="ghost" size="sm">
                <Link href={`/clientes/${order.customer_id}`}>
                  Ver ficha
                  <ExternalLink className="size-3.5" />
                </Link>
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base font-semibold">{order.customer_name || '—'}</span>
              {customerBadge}
            </div>
            <div className="text-sm text-muted-foreground">
              {order.customer_phone || 'Sin teléfono'}
              {order.customer_email && ` · ${order.customer_email}`}
              {order.customer_dni && ` · DNI ${order.customer_dni}`}
            </div>

            {addressStr && (
              <div className="space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Dirección
                </div>
                <div className="text-sm">{addressStr}</div>
                <div className="overflow-hidden rounded-md border border-border">
                  <iframe
                    title="Mapa de la dirección"
                    src={`https://www.google.com/maps?q=${encodeURIComponent(addressStr)}&output=embed`}
                    width="100%"
                    height={220}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    className="block border-0"
                  />
                </div>
                {mapsLink && (
                  <a
                    href={mapsLink}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
                  >
                    Abrir en Google Maps
                    <ExternalLink className="size-3.5" />
                  </a>
                )}
              </div>
            )}

            {order.notes && (
              <Alert variant="warning">
                <AlertTitle className="text-xs">Nota del cliente</AlertTitle>
                <AlertDescription>{order.notes}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* ITEMS */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Items ({order.items.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-col divide-y divide-border">
              {order.items.map((it, i) => (
                <div key={i} className="flex justify-between gap-3 py-2.5">
                  <div className="flex-1">
                    <div className="text-sm font-medium">{it.name}</div>
                    {it.sku && (
                      <div className="text-[11px] text-muted-foreground">SKU: {it.sku}</div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold tabular-nums">×{it.qty}</div>
                    <div className="text-[11px] text-muted-foreground tabular-nums">
                      ${Number(it.price).toLocaleString('es-AR')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {order.payment_method || 'Pago no especificado'}
              </span>
              <span className="text-base font-bold tabular-nums">
                ${Number(order.total).toLocaleString('es-AR')}
              </span>
            </div>

            {(profile.role === 'admin' || profile.role === 'operador') && (
              <ItemsEditor order={order} />
            )}
          </CardContent>
        </Card>

        {/* ACCIONES */}
        <OrderActions
          order={order}
          role={profile.role}
          repartidores={repartidores ?? []}
          zonas={(zonas ?? []) as ZonaReparto[]}
          suggestedRepartidorId={suggestedRepartidorId}
        />

        {/* INCIDENCIAS */}
        <IncidentsSection
          orderId={order.id}
          initialIncidents={incidents ?? []}
          users={changers ?? []}
        />

        {/* COMPROBANTE DE ENTREGA */}
        {(() => {
          const canEdit =
            profile.role === 'admin' ||
            profile.role === 'operador' ||
            (profile.role === 'repartidor' && order.assigned_to === profile.id)
          const relevant =
            order.tipo_envio !== 'retiro' && ['en_camino', 'entregado'].includes(order.status)
          if (!canEdit && !order.delivery_proof_url) return null
          if (!relevant && !order.delivery_proof_url) return null
          return (
            <DeliveryProof
              orderId={order.id}
              currentUrl={order.delivery_proof_url}
              canEdit={canEdit}
            />
          )
        })()}

        {/* HITOS / TIEMPOS */}
        {(() => {
          const entrada = order.woo_created_at || order.created_at
          const hitos: Array<{ label: string; ts: string | null; prev: string | null }> = [
            { label: 'Entró', ts: entrada, prev: null },
            { label: 'Confirmado', ts: order.confirmed_at, prev: entrada },
            { label: 'Listo', ts: order.ready_at, prev: order.confirmed_at ?? entrada },
            {
              label: 'Entregado',
              ts: order.delivered_at,
              prev: order.ready_at ?? order.confirmed_at ?? entrada,
            },
          ]
          const totalMin = minutesBetween(entrada, order.delivered_at)
          return (
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Tiempos
                </CardTitle>
                {totalMin !== null && (
                  <Badge variant="success">Total: {formatDuration(totalMin)}</Badge>
                )}
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-[auto_1fr_auto] gap-x-4 gap-y-1.5 text-sm">
                  {hitos.map((h, i) => {
                    const delta = minutesBetween(h.prev, h.ts)
                    return (
                      <div key={h.label} className="contents">
                        <div className="font-semibold text-muted-foreground">{h.label}</div>
                        <div className={h.ts ? '' : 'text-muted-foreground/60'}>
                          {h.ts ? new Date(h.ts).toLocaleString('es-AR') : 'pendiente'}
                        </div>
                        <div className="whitespace-nowrap text-xs text-muted-foreground">
                          {i > 0 && delta !== null ? `+${formatDuration(delta)}` : ''}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )
        })()}

        {/* TIMELINE */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Timeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(history ?? []).length === 0 ? (
              <div className="text-sm text-muted-foreground">Sin movimientos</div>
            ) : (
              <div className="relative pl-7">
                <div className="absolute left-2.5 top-2 bottom-2 w-0.5 bg-border" />
                {[...(history ?? [])].reverse().map((h: OrderStatusHistory) => (
                  <div key={h.id} className="relative pb-4 last:pb-0">
                    <div className="absolute -left-7 top-0 flex size-6 items-center justify-center rounded-full border-2 border-primary bg-primary/10 text-xs font-bold text-primary">
                      •
                    </div>
                    <OrderStatusBadge status={h.status} />
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {new Date(h.created_at).toLocaleString('es-AR')}
                      {h.changed_by &&
                        changerMap.has(h.changed_by) &&
                        ` · ${changerMap.get(h.changed_by)}`}
                    </div>
                    {h.note && (
                      <div className="mt-2 rounded-md border border-border bg-muted/40 p-2 text-sm">
                        {h.note}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <WhatsappMessagesList
          orderId={order.id}
          messages={messages ?? []}
          users={changers ?? []}
        />
      </div>
    </CrmShell>
  )
}
