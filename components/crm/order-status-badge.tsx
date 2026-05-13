import { Badge } from '@/components/ui/badge'
import { STATUS_LABELS } from '@/lib/types'
import type { OrderStatus } from '@/lib/types'
import { cn } from '@/lib/utils'

const VARIANTS: Record<OrderStatus, React.ComponentProps<typeof Badge>['variant']> = {
  nuevo: 'secondary',
  confirmado: 'info',
  en_preparacion: 'warning',
  listo: 'success',
  en_camino: 'info',
  entregado: 'outline',
  cancelado: 'destructive',
}

export function OrderStatusBadge({
  status,
  className,
}: {
  status: OrderStatus
  className?: string
}) {
  return (
    <Badge
      variant={VARIANTS[status]}
      className={cn('text-[10px] uppercase tracking-wide', className)}
    >
      {STATUS_LABELS[status]}
    </Badge>
  )
}
