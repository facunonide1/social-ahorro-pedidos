import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import type { AdminRole } from '@/lib/types/admin'
import {
  puede, type PermisoModulo, type PermisoAccion, type PermisosCustom,
} from '@/lib/types/permisos'

export type PerfilPermisos = {
  id: string
  rol: AdminRole
  sucursal_id: string | null
  sucursales_acceso: string[]
  permisos_custom: PermisosCustom
}

/** Lee el perfil de permisos del usuario logueado (o null). */
export async function getPerfilPermisos(): Promise<PerfilPermisos | null> {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return null
  const { data } = await sb
    .from('users_admin')
    .select('rol, sucursal_id, sucursales_acceso, permisos_custom, activo')
    .eq('id', user.id)
    .maybeSingle<{ rol: AdminRole; sucursal_id: string | null; sucursales_acceso: string[] | null; permisos_custom: PermisosCustom | null; activo: boolean }>()
  if (!data?.activo) return null
  return {
    id: user.id, rol: data.rol, sucursal_id: data.sucursal_id,
    sucursales_acceso: data.sucursales_acceso ?? [],
    permisos_custom: data.permisos_custom ?? {},
  }
}

/**
 * Gate de API por permiso fino. Devuelve `{ perfil }` si pasa, o
 * `{ error: NextResponse }` con 401/403 si no. El permiso negado en backend
 * es un 403 REAL (no solo ocultar en UI).
 *
 * @example
 *   const g = await requirePermiso('finanzas', 'aprobar')
 *   if ('error' in g) return g.error
 *   // ... usar g.perfil
 */
export async function requirePermiso(modulo: PermisoModulo, accion: PermisoAccion) {
  const perfil = await getPerfilPermisos()
  if (!perfil) return { error: NextResponse.json({ error: 'no autenticado' }, { status: 401 }) }
  if (!puede(perfil.rol, perfil.permisos_custom, modulo, accion)) {
    return { error: NextResponse.json({ error: `sin permiso (${modulo}:${accion})` }, { status: 403 }) }
  }
  return { perfil }
}
