import { Badge } from '@/components/ui/badge'
import { ESTADO_CHEQUE_LABELS } from '@/lib/types/admin'
import type { EstadoCheque } from '@/lib/types/admin'
import type { FacturaBadgeVariant } from '@/lib/admin-hub/factura'

export const ESTADO_CHEQUE_VARIANT: Record<EstadoCheque, FacturaBadgeVariant> = {
  emitido: 'info',
  en_cartera: 'warning',
  depositado: 'info',
  cobrado: 'success',
  rechazado: 'destructive',
  anulado: 'outline',
}

export function ChequeEstadoBadge({ estado }: { estado: EstadoCheque }) {
  return (
    <Badge variant={ESTADO_CHEQUE_VARIANT[estado]}>
      {ESTADO_CHEQUE_LABELS[estado]}
    </Badge>
  )
}
