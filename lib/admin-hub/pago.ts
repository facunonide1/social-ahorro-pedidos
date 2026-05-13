import type { PagoEstado } from '@/lib/types/admin'
import type { FacturaBadgeVariant } from '@/lib/admin-hub/factura'

export const PAGO_ESTADO_VARIANT: Record<PagoEstado, FacturaBadgeVariant> = {
  solicitado: 'warning',
  aprobado: 'info',
  ejecutado: 'success',
  conciliado: 'info',
  anulado: 'outline',
}
