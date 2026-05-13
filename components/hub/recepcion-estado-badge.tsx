import { Badge } from '@/components/ui/badge'
import { RECEPCION_ESTADO_LABELS } from '@/lib/types/admin'
import type { RecepcionEstado } from '@/lib/types/admin'
import type { FacturaBadgeVariant } from '@/lib/admin-hub/factura'

export const RECEPCION_ESTADO_VARIANT: Record<RecepcionEstado, FacturaBadgeVariant> = {
  completa: 'success',
  parcial: 'warning',
  con_diferencias: 'destructive',
  rechazada: 'outline',
}

export function RecepcionEstadoBadge({ estado }: { estado: RecepcionEstado }) {
  return (
    <Badge variant={RECEPCION_ESTADO_VARIANT[estado]}>
      {RECEPCION_ESTADO_LABELS[estado]}
    </Badge>
  )
}
