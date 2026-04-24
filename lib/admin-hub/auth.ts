import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { AdminRole } from '@/lib/types/admin'

export type HubProfile = {
  id: string
  email: string
  nombre: string | null
  rol: AdminRole
  sucursal_id: string | null
}

/**
 * Usar en los server components de /hub/*. Garantiza que el user
 * esté logueado, tenga fila activa en users_admin, y (opcional)
 * tenga uno de los roles permitidos. Si falla, redirige al flow
 * correspondiente en vez de devolver null.
 */
export async function requireAdminHubAccess(opts?: {
  allowedRoles?: AdminRole[]
}): Promise<HubProfile> {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await sb
    .from('users_admin')
    .select('rol, sucursal_id, activo')
    .eq('id', user.id)
    .maybeSingle<{ rol: AdminRole; sucursal_id: string | null; activo: boolean }>()

  if (!profile?.activo) redirect('/logout?reason=sin_permiso')

  if (opts?.allowedRoles && opts.allowedRoles.length > 0) {
    if (!opts.allowedRoles.includes(profile.rol)) {
      redirect('/hub?denied=1')
    }
  }

  return {
    id: user.id,
    email: user.email ?? '',
    nombre: (user.user_metadata as any)?.nombre ?? null,
    rol: profile.rol,
    sucursal_id: profile.sucursal_id,
  }
}
