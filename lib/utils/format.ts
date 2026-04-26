import { format, formatDistanceToNow, parseISO, isValid } from 'date-fns'
import { es } from 'date-fns/locale'

const AR_LOCALE = 'es-AR'

/* =====================================================================
 * Money / Numbers
 * =====================================================================*/

/** "$ 1.234.567,89" — moneda ARS con 2 decimales por default. */
export function formatARS(value: number | string | null | undefined, decimals = 2): string {
  const n = toNumber(value)
  if (n === null) return '—'
  return new Intl.NumberFormat(AR_LOCALE, {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n)
}

/** "1.234.567,89" — número genérico AR. */
export function formatNumber(
  value: number | string | null | undefined,
  decimals = 2,
): string {
  const n = toNumber(value)
  if (n === null) return '—'
  return new Intl.NumberFormat(AR_LOCALE, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n)
}

/** "12,5%" — porcentaje, recibe el valor *en porcentaje* (no fracción). */
export function formatPercent(
  value: number | string | null | undefined,
  decimals = 1,
): string {
  const n = toNumber(value)
  if (n === null) return '—'
  return `${formatNumber(n, decimals)}%`
}

/** "12,5%" — porcentaje desde una fracción (0.125 → "12,5%"). */
export function formatPercentFromRatio(
  value: number | string | null | undefined,
  decimals = 1,
): string {
  const n = toNumber(value)
  if (n === null) return '—'
  return formatPercent(n * 100, decimals)
}

/* =====================================================================
 * Fechas
 * =====================================================================*/

/** "25/04/2026" por default. Acepta string ISO, Date o número (ms). */
export function formatDate(
  value: Date | string | number | null | undefined,
  pattern = 'dd/MM/yyyy',
): string {
  const d = toDate(value)
  if (!d) return '—'
  return format(d, pattern, { locale: es })
}

/** "25/04/2026 14:30". */
export function formatDateTime(value: Date | string | number | null | undefined): string {
  const d = toDate(value)
  if (!d) return '—'
  return format(d, 'dd/MM/yyyy HH:mm', { locale: es })
}

/** "hace 2 días", "en 3 horas". */
export function formatRelativeDate(value: Date | string | number | null | undefined): string {
  const d = toDate(value)
  if (!d) return '—'
  return formatDistanceToNow(d, { addSuffix: true, locale: es })
}

/* =====================================================================
 * Documentos / contables AR
 * =====================================================================*/

/** "20-12345678-9". Tolera input con o sin guiones. */
export function formatCUIT(value: string | null | undefined): string {
  if (!value) return '—'
  const digits = value.replace(/\D/g, '')
  if (digits.length !== 11) return value // devolver tal cual si no es válido
  return `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}`
}

/** "1234 5678 9012 3456 7890 12" — CBU con espacios cada 4. */
export function formatCBU(value: string | null | undefined): string {
  if (!value) return '—'
  const digits = value.replace(/\D/g, '')
  return digits.replace(/(.{4})/g, '$1 ').trim()
}

/** "30 días" / "1 día". */
export function formatPlazoPago(dias: number | null | undefined): string {
  if (dias == null) return '—'
  if (dias === 1) return '1 día'
  return `${dias} días`
}

/* =====================================================================
 * Helpers internos
 * =====================================================================*/

function toNumber(value: number | string | null | undefined): number | null {
  if (value == null) return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

function toDate(value: Date | string | number | null | undefined): Date | null {
  if (value == null || value === '') return null
  if (value instanceof Date) return isValid(value) ? value : null
  if (typeof value === 'number') {
    const d = new Date(value)
    return isValid(d) ? d : null
  }
  const parsed = parseISO(value)
  if (isValid(parsed)) return parsed
  const fallback = new Date(value)
  return isValid(fallback) ? fallback : null
}
