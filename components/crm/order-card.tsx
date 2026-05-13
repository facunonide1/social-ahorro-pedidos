import Link from 'next/link'

import type { Order } from '@/lib/types'
import { ORIGIN_LABELS } from '@/lib/types'
import { formatOrderNumber } from '@/lib/orders/format'

import { Badge } from '@/components/ui/badge'
import { OrderStatusBadge } from '@/components/crm/order-status-badge'
import { OrderTipoEnvioBadge } from '@/components/crm/order-tipo-envio-badge'
import { OrderTimeBadge } from '@/components/crm/order-time-badge'

export function OrderCard({
  order,
  customerOrdersCount,
  hasIncident = false,
  showStatus = false,
}: {
  order: Order
  customerOrdersCount?: number
  hasIncident?: boolean
  /** En vista lista podemos querer ver el estado en la card. */
  showStatus?: boolean
}) {
  const isNewCustomer = customerOrdersCount === 1
  const isReturning = (customerOrdersCount ?? 0) >= 2
  const needsRepartidor =
    !order.assigned_to &&
    order.status !== 'entregado' &&
    order.status !== 'cancelado' &&
    order.tipo_envio !== 'retiro'

  return (
    <Link
      href={`/pedidos/${order.id}`}
      className="block rounded-lg border border-border bg-card p-3 transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-ring"
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-bold tracking-tight">
            {formatOrderNumber(order)}
          </span>
          <span className="text-sm font-bold tabular-nums">
            ${Number(order.total).toLocaleString('es-AR')}
          </span>
        </div>

        <div className="flex flex-wrap gap-1">
          <OrderTipoEnvioBadge tipo={order.tipo_envio} status={order.status} />
          {showStatus && <OrderStatusBadge status={order.status} />}
          <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
            {ORIGIN_LABELS[order.origin]}
          </Badge>
          {isNewCustomer && (
            <Badge variant="success" className="text-[10px] uppercase tracking-wide">
              Nuevo
            </Badge>
          )}
          {isReturning && (
            <Badge variant="info" className="text-[10px] uppercase tracking-wide">
              {customerOrdersCount} pedidos
            </Badge>
          )}
          {order.fuera_de_horario && (
            <Badge variant="warning" className="text-[10px] uppercase tracking-wide">
              Fuera de horario
            </Badge>
          )}
          {needsRepartidor && (
            <Badge variant="destructive" className="text-[10px] uppercase tracking-wide">
              Sin repartidor
            </Badge>
          )}
          {hasIncident && (
            <Badge variant="destructive" className="text-[10px] uppercase tracking-wide">
              Incidencia
            </Badge>
          )}
        </div>

        <div className="text-sm text-foreground">{order.customer_name || '—'}</div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            {order.customer_phone || 's/tel'} · {order.items?.length ?? 0} item
            {(order.items?.length ?? 0) === 1 ? '' : 's'}
          </span>
          <OrderTimeBadge
            iso={order.woo_created_at || order.created_at}
            status={order.status}
          />
        </div>
      </div>
    </Link>
  )
}
