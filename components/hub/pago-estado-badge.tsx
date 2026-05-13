import { Badge } from '@/components/ui/badge'
import { PAGO_ESTADO_VARIANT } from '@/lib/admin-hub/pago'
import { PAGO_ESTADO_LABELS } from '@/lib/types/admin'
import type { PagoEstado } from '@/lib/types/admin'

export function PagoEstadoBadge({ estado }: { estado: PagoEstado }) {
  return (
    <Badge variant={PAGO_ESTADO_VARIANT[estado]}>
      {PAGO_ESTADO_LABELS[estado]}
    </Badge>
  )
}
