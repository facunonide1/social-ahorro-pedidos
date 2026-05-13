import { Badge } from '@/components/ui/badge'
import { relativeFrom, type Severity } from '@/lib/orders/timing'
import type { OrderStatus } from '@/lib/types'
import { cn } from '@/lib/utils'

const VARIANTS: Record<Severity, React.ComponentProps<typeof Badge>['variant']> = {
  ok: 'success',
  warn: 'warning',
  critical: 'destructive',
  done: 'outline',
}

export function OrderTimeBadge({
  iso,
  status,
  className,
}: {
  iso: string | null | undefined
  status: OrderStatus
  className?: string
}) {
  const { text, severity } = relativeFrom(iso, status)
  return (
    <Badge
      variant={VARIANTS[severity]}
      className={cn('whitespace-nowrap text-[10px] tracking-wide', className)}
    >
      {text}
    </Badge>
  )
}
