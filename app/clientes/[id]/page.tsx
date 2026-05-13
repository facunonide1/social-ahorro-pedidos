import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle, Star } from 'lucide-react'

import { createClient } from '@/lib/supabase/server'
import type { Customer, Order, UserPedidos } from '@/lib/types'
import { formatOrderNumber } from '@/lib/orders/format'

import { CrmShell } from '@/components/crm/crm-shell'
import { OrderStatusBadge } from '@/components/crm/order-status-badge'
import { OrderTipoEnvioBadge } from '@/components/crm/order-tipo-envio-badge'
import { KpiCard } from '@/components/cards/kpi-card'
import { PageHeader } from '@/components/shared/page-header'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

import CustomerEditor from './editor'

export const dynamic = 'force-dynamic'

export default async function ClienteDetailPage({ params }: { params: { id: string } }) {
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
  if (profile.role === 'repartidor') redirect('/repartidor')

  const { data: customer } = await sb
    .from('customers')
    .select('*')
    .eq('id', params.id)
    .maybeSingle<Customer>()

  if (!customer) notFound()

  const { data: orders } = await sb
    .from('orders')
    .select('*')
    .eq('customer_id', customer.id)
    .order('created_at', { ascending: false })
    .limit(100)
    .returns<Order[]>()

  const ordersList = orders ?? []
  const relevantes = ordersList.filter((o) => o.status !== 'cancelado')
  const totalFacturado = relevantes.reduce((acc, o) => acc + Number(o.total || 0), 0)
  const ticketPromedio = relevantes.length
    ? Math.round(totalFacturado / relevantes.length)
    : 0
  const ultimoPedido = ordersList[0]?.created_at ?? null
  const diasDesdeUltimo = ultimoPedido
    ? Math.floor((Date.now() - new Date(ultimoPedido).getTime()) / 86400000)
    : null

  let frecuenciaDias: number | null = null
  if (relevantes.length >= 2) {
    const sorted = [...relevantes].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    )
    const first = new Date(sorted[0].created_at).getTime()
    const last = new Date(sorted[sorted.length - 1].created_at).getTime()
    frecuenciaDias = Math.round((last - first) / 86400000 / (sorted.length - 1))
  }

  const payCounts = new Map<string, number>()
  for (const o of ordersList) {
    if (o.payment_method)
      payCounts.set(o.payment_method, (payCounts.get(o.payment_method) ?? 0) + 1)
  }
  let metodoPreferido: string | null = null
  let maxN = 0
  for (const [m, n] of payCounts)
    if (n > maxN) {
      metodoPreferido = m
      maxN = n
    }

  const isBlacklisted = customer.tags.includes('blacklist')
  const hasIncidents =
    ordersList.length > 0 &&
    (await (async () => {
      const { count } = await sb
        .from('order_incidents')
        .select('id', { count: 'exact', head: true })
        .in(
          'order_id',
          ordersList.map((o) => o.id),
        )
      return (count ?? 0) > 0
    })())

  let tipoCliente: 'NUEVO' | 'RECURRENTE' | 'VIP' | null = null
  if (relevantes.length >= 10) tipoCliente = 'VIP'
  else if (relevantes.length >= 2) tipoCliente = 'RECURRENTE'
  else if (relevantes.length === 1) tipoCliente = 'NUEVO'

  return (
    <CrmShell>
      <PageHeader
        title={customer.name || '(sin nombre)'}
        description={
          <>
            {ordersList.length} pedido{ordersList.length === 1 ? '' : 's'} · total $
            {totalFacturado.toLocaleString('es-AR')}
          </>
        }
        breadcrumbs={[{ label: 'Clientes', href: '/clientes' }, { label: customer.name || '(sin nombre)' }]}
      />

      <div className="mx-auto w-full max-w-5xl space-y-4 p-4 md:p-6">
        {isBlacklisted && (
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertTitle>Cliente en lista negra</AlertTitle>
            {customer.notes && (
              <AlertDescription className="mt-1 whitespace-pre-wrap">
                {customer.notes}
              </AlertDescription>
            )}
          </Alert>
        )}

        {/* KPIs */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <KpiCard label="Pedidos" value={ordersList.length} />
          <KpiCard
            label="Monto total"
            value={totalFacturado}
            format="currency"
            variant="success"
          />
          <KpiCard label="Ticket promedio" value={ticketPromedio} format="currency" />
          <KpiCard
            label="Último pedido"
            value={null}
            formattedValue={
              diasDesdeUltimo === null
                ? '—'
                : diasDesdeUltimo === 0
                  ? 'hoy'
                  : `hace ${diasDesdeUltimo}d`
            }
            format="custom"
          />
          <KpiCard
            label="Frecuencia"
            value={null}
            formattedValue={frecuenciaDias === null ? '—' : `cada ${frecuenciaDias}d`}
            format="custom"
          />
          <KpiCard
            label="Pago preferido"
            value={null}
            formattedValue={metodoPreferido ?? '—'}
            format="custom"
          />
        </section>

        {/* Badges categoría */}
        {(tipoCliente || hasIncidents) && (
          <div className="flex flex-wrap gap-2">
            {tipoCliente === 'VIP' && (
              <Badge variant="warning" className="gap-1 text-xs uppercase tracking-wide">
                <Star className="size-3.5" />
                VIP
              </Badge>
            )}
            {tipoCliente === 'RECURRENTE' && (
              <Badge variant="info" className="text-xs uppercase tracking-wide">
                Recurrente
              </Badge>
            )}
            {tipoCliente === 'NUEVO' && (
              <Badge variant="success" className="text-xs uppercase tracking-wide">
                Nuevo
              </Badge>
            )}
            {hasIncidents && (
              <Badge variant="destructive" className="text-xs uppercase tracking-wide">
                Con incidencias
              </Badge>
            )}
          </div>
        )}

        {/* Editor */}
        <CustomerEditor customer={customer} />

        {/* Historial */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Historial de pedidos
            </CardTitle>
          </CardHeader>
          <CardContent>
            {ordersList.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                Sin pedidos asociados todavía.
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {ordersList.map((o) => (
                  <Link
                    key={o.id}
                    href={`/pedidos/${o.id}`}
                    className="grid grid-cols-1 items-center gap-2 rounded-md border border-border bg-muted/30 p-3 transition-colors hover:bg-muted sm:grid-cols-[1fr_auto_auto]"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold">{formatOrderNumber(o)}</span>
                        <OrderTipoEnvioBadge tipo={o.tipo_envio} status={o.status} />
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        {new Date(o.woo_created_at || o.created_at).toLocaleString('es-AR')}{' '}
                        · {o.items?.length ?? 0} item
                        {(o.items?.length ?? 0) === 1 ? '' : 's'}
                      </div>
                    </div>
                    <OrderStatusBadge status={o.status} />
                    <span className="text-sm font-bold tabular-nums">
                      ${Number(o.total).toLocaleString('es-AR')}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </CrmShell>
  )
}
