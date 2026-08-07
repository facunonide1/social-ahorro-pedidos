import { createClient } from '@/lib/supabase/server'
import { puede, type PermisosCustom } from '@/lib/types/permisos'
import type { AdminRole } from '@/lib/types/admin'

export type GateDocumentos =
  | { error: string; status: 401 | 403 }
  | { ok: true; userId: string; rol: AdminRole; permisosCustom: PermisosCustom | null; nombre: string | null }

/**
 * Gate del motor de documentos: hace falta poder crear en Finanzas o en
 * Compras. Un documento comercial entra por cualquiera de las dos puertas —
 * una factura la carga Finanzas, un remito lo recibe Compras.
 *
 * `accion` distingue mirar (`ver`) de cargar/confirmar (`crear`).
 */
export async function gateDocumentos(accion: 'ver' | 'crear' = 'crear'): Promise<GateDocumentos> {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: 'no autenticado', status: 401 }

  const { data: me } = await sb
    .from('users_admin')
    .select('rol, activo, permisos_custom')
    .eq('id', user.id)
    .maybeSingle<{ rol: AdminRole; activo: boolean; permisos_custom: PermisosCustom | null }>()

  if (!me?.activo) return { error: 'usuario inactivo', status: 403 }

  const custom = me.permisos_custom ?? null
  if (!puede(me.rol, custom, 'finanzas', accion) && !puede(me.rol, custom, 'compras', accion)) {
    return { error: 'sin permiso sobre documentos de compra', status: 403 }
  }

  const nombre = ((user.user_metadata as Record<string, any> | null)?.nombre as string) ?? null
  return { ok: true, userId: user.id, rol: me.rol, permisosCustom: custom, nombre }
}
