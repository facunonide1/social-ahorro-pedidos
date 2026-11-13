import { timingSafeEqual } from 'node:crypto'

/**
 * ¿El pedido viene del cron de Vercel? Vercel manda
 * `Authorization: Bearer ${CRON_SECRET}` solo si la variable existe en el
 * proyecto. Puro, para poder probarlo.
 */
export function cronAutorizado(header: string | null, secreto: string | undefined): 'ok' | 'rechazado' | 'sin_configurar' {
  if (!secreto) return 'sin_configurar'
  const esperado = Buffer.from(`Bearer ${secreto}`)
  const vino = Buffer.from(header ?? '')
  if (vino.length !== esperado.length) return 'rechazado'
  return timingSafeEqual(vino, esperado) ? 'ok' : 'rechazado'
}
