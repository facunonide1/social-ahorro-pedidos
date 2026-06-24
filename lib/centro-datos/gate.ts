import { createClient } from '@/lib/supabase/server'
import type { AdminRole } from '@/lib/types/admin'

/** Gate del Centro de Datos: super_admin / gerente gestionan (igual que la RLS). */
export async function gateCentroDatos() {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: 'no autenticado', status: 401 as const }
  // 'nombre' NO existe en users_admin (vive en auth.users.user_metadata).
  // Seleccionarla hacía fallar el query → me null → "sin permiso" para todos.
  const { data: me } = await sb
    .from('users_admin').select('rol, activo')
    .eq('id', user.id).maybeSingle<{ rol: AdminRole; activo: boolean }>()
  if (!me || !me.activo || !['super_admin', 'gerente'].includes(me.rol)) {
    return { error: 'sin permiso', status: 403 as const }
  }
  const nombre = ((user.user_metadata as Record<string, any> | null)?.nombre as string) ?? user.email ?? null
  return { ok: true as const, userId: user.id, nombre }
}
