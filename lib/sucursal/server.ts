import { cookies } from 'next/headers'

/**
 * Sucursal activa global (lado servidor).
 *
 * El selector del header (cliente) persiste la elección en la cookie
 * `sa_sucursal` (además del store local). Los Server Components leen esa cookie
 * con `getSucursalActiva()` para filtrar sus queries por sucursal.
 *
 * - `esTodas = true` → consolidado (no filtrar).
 * - `sucursalId = '<uuid>'` → filtrar `WHERE sucursal_id = sucursalId`.
 *
 * Nota: cuando el selector cambia, el cliente hace `router.refresh()` para que
 * los Server Components vuelvan a ejecutarse con la nueva cookie.
 */
export const SUCURSAL_COOKIE = 'sa_sucursal'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function getSucursalActiva(): { sucursalId: string | null; esTodas: boolean } {
  const raw = cookies().get(SUCURSAL_COOKIE)?.value ?? 'todas'
  if (raw === 'todas' || !UUID_RE.test(raw)) return { sucursalId: null, esTodas: true }
  return { sucursalId: raw, esTodas: false }
}

/**
 * Helper para aplicar el filtro a un query builder de Supabase de forma
 * uniforme. Si es 'todas' no toca el query.
 *
 * @example
 *   let q = sb.from('stock_items').select('*')
 *   q = filtrarPorSucursal(q)
 */
export function filtrarPorSucursal<T>(query: T, columna = 'sucursal_id'): T {
  const { sucursalId, esTodas } = getSucursalActiva()
  if (esTodas || !sucursalId) return query
  // @ts-expect-error - el builder de Supabase expone .eq encadenable
  return query.eq(columna, sucursalId)
}
