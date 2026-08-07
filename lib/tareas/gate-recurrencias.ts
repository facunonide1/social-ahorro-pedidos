import { createClient } from '@/lib/supabase/server'
import type { AdminRole } from '@/lib/types/admin'

/**
 * Gate de gestión de recurrencias: requiere super_admin o gerente.
 *
 * Vive acá y no en `app/api/admin/recurrencias/route.ts` porque Next no permite
 * exportar nada que no sea un handler o config desde un `route.ts`, y las dos
 * rutas de recurrencias (colección y detalle) necesitan el mismo gate.
 */
export async function gateGestion() {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: 'no autenticado', status: 401 as const }
  const { data: me } = await sb
    .from('users_admin')
    .select('rol, activo')
    .eq('id', user.id)
    .maybeSingle<{ rol: AdminRole; activo: boolean }>()
  if (!me || !me.activo || !['super_admin', 'gerente'].includes(me.rol)) {
    return { error: 'requiere super_admin o gerente', status: 403 as const, userId: '' }
  }
  return { ok: true as const, userId: user.id }
}
