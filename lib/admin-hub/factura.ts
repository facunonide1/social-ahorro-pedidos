import type { FacturaEstado } from '@/lib/types/admin'

export type FacturaBadgeVariant =
  | 'outline'
  | 'warning'
  | 'info'
  | 'success'
  | 'destructive'
  | 'secondary'

export const FACTURA_ESTADO_VARIANT: Record<FacturaEstado, FacturaBadgeVariant> = {
  borrador: 'outline',
  pendiente_aprobacion: 'warning',
  aprobada: 'info',
  programada_pago: 'info',
  pagada_parcial: 'warning',
  pagada: 'success',
  vencida: 'destructive',
  rechazada: 'destructive',
  anulada: 'outline',
}

export type VencimientoInfo = {
  text: string
  variant: 'destructive' | 'warning'
}

export function vencimientoBadge(
  fecha: string | null,
  estado: FacturaEstado,
): VencimientoInfo | null {
  if (!fecha) return null
  if (['pagada', 'anulada', 'rechazada'].includes(estado)) return null
  const days = Math.floor((new Date(fecha).getTime() - Date.now()) / 86400000)
  if (days < 0) return { text: `Vencido ${-days}d`, variant: 'destructive' }
  if (days <= 7) return { text: `Vence en ${days}d`, variant: 'warning' }
  return null
}
