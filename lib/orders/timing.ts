import type { OrderStatus } from '@/lib/types'

export type Severity = 'ok' | 'warn' | 'critical' | 'done'

export const SEVERITY_COLORS: Record<Severity, { fg: string; bg: string; border: string }> = {
  ok:       { fg: '#1f8a4c', bg: '#eaf7ef', border: '#8fd1a8' },
  warn:     { fg: '#c6831a', bg: '#fff7ec', border: '#edc989' },
  critical: { fg: '#a33',    bg: '#fbeaea', border: '#e0a8a8' },
  done:     { fg: '#888',    bg: '#f5f5f5', border: '#e2e2e2' },
}

/** Umbrales (en minutos) según el estado del pedido. */
const THRESHOLDS: Record<OrderStatus, [number, number]> = {
  nuevo:          [15, 30],
  confirmado:     [15, 30],
  en_preparacion: [15, 30],
  listo:          [15, 30],
  en_camino:      [30, 60],
  entregado:      [0, 0],
  cancelado:      [0, 0],
}

/**
 * Devuelve un texto tipo "hace 5 min" / "hace 2 h 10 min" más una
 * severidad que depende del estado y los umbrales.
 */
export function relativeFrom(iso: string | null | undefined, status: OrderStatus, now = new Date()): {
  text: string
  severity: Severity
  minutes: number
} {
  if (!iso) return { text: '—', severity: 'done', minutes: 0 }

  const then = new Date(iso).getTime()
  const diffMs = Math.max(0, now.getTime() - then)
  const minutes = Math.floor(diffMs / 60000)

  let text: string
  if (minutes < 1)                   text = 'recién'
  else if (minutes < 60)             text = `hace ${minutes} min`
  else if (minutes < 60 * 24) {
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    text = m === 0 ? `hace ${h} h` : `hace ${h} h ${m} min`
  } else {
    const d = Math.floor(minutes / (60 * 24))
    text = d === 1 ? 'hace 1 día' : `hace ${d} días`
  }

  let severity: Severity
  if (status === 'entregado' || status === 'cancelado') {
    severity = 'done'
  } else {
    const [warnAt, critAt] = THRESHOLDS[status]
    if (minutes >= critAt) severity = 'critical'
    else if (minutes >= warnAt) severity = 'warn'
    else severity = 'ok'
  }

  return { text, severity, minutes }
}

/** Diferencia en minutos entre dos timestamps, o null si falta alguno. */
export function minutesBetween(a: string | null | undefined, b: string | null | undefined): number | null {
  if (!a || !b) return null
  return Math.max(0, Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 60000))
}

/** Formato humano de una duración en minutos: "5 min" / "1 h 10 min". */
export function formatDuration(minutes: number | null): string {
  if (minutes === null) return '—'
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}
