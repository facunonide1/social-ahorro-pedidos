/**
 * Quién puede disparar el cron de la ingesta de Drive.
 *
 * Vercel manda `Authorization: Bearer <CRON_SECRET>` en cada cron, y sólo si
 * CRON_SECRET está configurado en el proyecto. Si no está, Vercel no manda
 * nada y el cron recibe 401 en cada corrida: desde afuera parece que «no
 * corrió». Por eso el motivo se distingue y se loguea, en vez de un 401 mudo.
 */
export type MotivoCron = 'ok' | 'sin_cron_secret' | 'secreto_invalido'

export function validarCron(headers: { get(n: string): string | null }, env: Record<string, string | undefined> = process.env): MotivoCron {
  const secreto = env.CRON_SECRET
  if (!secreto) return 'sin_cron_secret'
  return headers.get('authorization') === `Bearer ${secreto}` ? 'ok' : 'secreto_invalido'
}
