import { Badge } from '@/components/ui/badge'
import { FACTURA_ESTADO_VARIANT } from '@/lib/admin-hub/factura'
import { FACTURA_ESTADO_LABELS } from '@/lib/types/admin'
import type { FacturaEstado } from '@/lib/types/admin'

export function FacturaEstadoBadge({ estado }: { estado: FacturaEstado }) {
  return (
    <Badge variant={FACTURA_ESTADO_VARIANT[estado]}>
      {FACTURA_ESTADO_LABELS[estado]}
    </Badge>
  )
}
