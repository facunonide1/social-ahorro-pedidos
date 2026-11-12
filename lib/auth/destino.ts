/**
 * QUIÉN ENTRA A QUÉ: /admin (NORA) y /pedidos (el CRM de pedidos viejo).
 *
 * Son dos tablas de perfiles: `users_admin` (rol de NORA, sucursal) y
 * `users_pedidos` (admin / operador / repartidor del CRM). Una persona puede
 * estar en las dos. La regla, en un solo lugar y con tests:
 *
 *   /           → NORA si tiene admin activo (gana sobre pedidos);
 *                 si no, repartidor → /repartidor; otro rol de pedidos activo
 *                 → /dashboard; ninguno → panel de diagnóstico (no se
 *                 desloguea a nadie que podría estar a medio configurar).
 *   /pedidos    → se queda si tiene pedidos activo y no es repartidor;
 *                 repartidor → /repartidor; sin pedidos activo pero con
 *                 admin activo → /admin/pedidos (desde el #8, antes lo
 *                 deslogueaba); sin ninguno → logout «sin permiso».
 */

export type PerfilAdmin = { activo: boolean } | null | undefined
export type PerfilPedidos = { active: boolean; role: string } | null | undefined

export type DestinoRaiz = '/admin' | '/repartidor' | '/dashboard' | 'diagnostico'

export function destinoRaiz(admin: PerfilAdmin, pedidos: PerfilPedidos): DestinoRaiz {
  if (admin?.activo) return '/admin'
  if (pedidos?.active) return pedidos.role === 'repartidor' ? '/repartidor' : '/dashboard'
  return 'diagnostico'
}

export type DestinoPedidos = 'quedarse' | '/repartidor' | '/admin/pedidos' | '/logout?reason=sin_permiso'

export function destinoPedidos(admin: PerfilAdmin, pedidos: PerfilPedidos): DestinoPedidos {
  if (pedidos?.active) return pedidos.role === 'repartidor' ? '/repartidor' : 'quedarse'
  if (admin?.activo) return '/admin/pedidos'
  return '/logout?reason=sin_permiso'
}
