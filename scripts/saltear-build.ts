/**
 * El build de preview no tiene las env de Supabase: están en production, y en
 * preview sólo en la rama vieja `feature/crm-redesign`. `npm run build` corre
 * el auditor de RLS y cortaba con "Falta NEXT_PUBLIC_SUPABASE_URL".
 *
 * En production, con las variables, `motivoSaltearAuditor` devuelve null y el
 * script sigue igual.
 */

export const ENV_AUDITOR_RLS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const

export function motivoSaltearAuditor(
  env: Record<string, string | undefined>,
  requeridas: readonly string[] = ENV_AUDITOR_RLS,
): string | null {
  const faltan = requeridas.filter((nombre) => !env[nombre])
  const noEsProduccion = env.VERCEL_ENV !== 'production'
  if (!noEsProduccion && faltan.length === 0) return null
  const partes: string[] = []
  if (noEsProduccion) partes.push(`VERCEL_ENV=${env.VERCEL_ENV ?? 'undefined'}`)
  if (faltan.length) partes.push(`faltan ${faltan.join(', ')}`)
  return partes.join('; ')
}

/** Sólo por variables ausentes. No mira VERCEL_ENV. */
export function motivoFaltanEnv(
  env: Record<string, string | undefined>,
  requeridas: readonly string[],
): string | null {
  const faltan = requeridas.filter((nombre) => !env[nombre])
  if (faltan.length === 0) return null
  return `faltan ${faltan.join(', ')}`
}
