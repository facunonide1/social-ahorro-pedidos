import { createClient } from '@/lib/supabase/server'
import type { AdminRole } from '@/lib/types/admin'
import { puede, type PermisoAccion, type PermisosCustom } from '@/lib/types/permisos'

/** Gate del CRM por permiso fino (módulo `clientes`). 403 real. */
export async function gateCrm(accion: PermisoAccion = 'ver') {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: 'no autenticado', status: 401 as const }
  // 'nombre' NO existe en users_admin (vive en auth.users.user_metadata).
  const { data: me } = await sb.from('users_admin').select('rol, activo, permisos_custom')
    .eq('id', user.id).maybeSingle<{ rol: AdminRole; activo: boolean; permisos_custom: PermisosCustom | null }>()
  if (!me || !me.activo) return { error: 'sin permiso', status: 403 as const }
  if (!puede(me.rol, me.permisos_custom ?? null, 'clientes', accion)) {
    return { error: `sin permiso (clientes:${accion})`, status: 403 as const }
  }
  const nombre = ((user.user_metadata as Record<string, any> | null)?.nombre as string) ?? user.email ?? null
  return { ok: true as const, userId: user.id, nombre, rol: me.rol }
}
