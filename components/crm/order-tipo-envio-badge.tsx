import { Badge } from '@/components/ui/badge'
import { TIPO_ENVIO_LABELS } from '@/lib/types'
import type { TipoEnvio, OrderStatus } from '@/lib/types'
import { cn } from '@/lib/utils'

const VARIANTS: Record<TipoEnvio, React.ComponentProps<typeof Badge>['variant']> = {
  express: 'destructive',
  programado: 'info',
  retiro: 'secondary',
}

export function OrderTipoEnvioBadge({
  tipo,
  status,
  className,
}: {
  tipo: TipoEnvio
  /** Si está activo (no entregado/cancelado) y es express, parpadea. */
  status?: OrderStatus
  className?: string
}) {
  const isExpressActive =
    tipo === 'express' && status !== 'entregado' && status !== 'cancelado'
  return (
    <Badge
      variant={VARIANTS[tipo]}
      className={cn(
        'text-[10px] uppercase tracking-wide',
        isExpressActive && 'sa-express-pulse',
        className,
      )}
    >
      {TIPO_ENVIO_LABELS[tipo]}
    </Badge>
  )
}
