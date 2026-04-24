import type { FacturaEstado } from '@/lib/types/admin'

export const FACTURA_ESTADO_COLORS: Record<FacturaEstado, { fg: string; bg: string; border: string }> = {
  borrador:             { fg: '#888',    bg: '#f5f5f5', border: '#e2e2e2' },
  pendiente_aprobacion: { fg: '#c6831a', bg: '#fff7ec', border: '#edc989' },
  aprobada:             { fg: '#726DFF', bg: '#eeedff', border: '#d9d6ff' },
  programada_pago:      { fg: '#2855c7', bg: '#e9f0ff', border: '#9cb6ee' },
  pagada_parcial:       { fg: '#c6831a', bg: '#fff7ec', border: '#edc989' },
  pagada:               { fg: '#1f8a4c', bg: '#eaf7ef', border: '#8fd1a8' },
  vencida:              { fg: '#a33',    bg: '#fbeaea', border: '#e0a8a8' },
  rechazada:            { fg: '#a33',    bg: '#fbeaea', border: '#e0a8a8' },
  anulada:              { fg: '#888',    bg: '#f5f5f5', border: '#e2e2e2' },
}

export function vencimientoBadge(fecha: string | null, estado: FacturaEstado): { text: string; fg: string; bg: string; border: string } | null {
  if (!fecha) return null
  if (['pagada','anulada','rechazada'].includes(estado)) return null
  const days = Math.floor((new Date(fecha).getTime() - Date.now()) / 86400000)
  if (days < 0) return { text: `Vencido ${-days}d`, fg: '#a33', bg: '#fbeaea', border: '#e0a8a8' }
  if (days <= 7) return { text: `Vence en ${days}d`, fg: '#c6831a', bg: '#fff7ec', border: '#edc989' }
  return null
}
