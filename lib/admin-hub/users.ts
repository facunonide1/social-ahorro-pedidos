import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { AdminRole } from '@/lib/types/admin'

export type AdminUserOption = {
  id: string
  nombre: string | null
  email: string
  rol: AdminRole
  sucursal_id: string | null
}

/**
 * Lista de usuarios admin activos del ERP — resuelve nombres/emails
 * desde auth.users con service role y los cruza con users_admin.
 *
 * Compartido por todos los pickers (asignar tarea, vendedor de
 * cliente, aprobador, etc.).
 */
export async function listAdminUsers(opts?: {
  roles?: AdminRole[]
}): Promise<AdminUserOption[]> {
  const sb = createClient()
  let q = sb
    .from('users_admin')
    .select('id, rol, sucursal_id, activo')
    .eq('activo', true)
  const admins = (await q).data ?? []
  let elegibles = admins as any[]
  if (opts?.roles && opts.roles.length > 0) {
    elegibles = elegibles.filter((a) => opts.roles!.includes(a.rol))
  }
  if (elegibles.length === 0) return []

  try {
    const admin = createAdminClient()
    const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
    const byId = new Map(
      (data?.users ?? []).map((u) => [
        u.id,
        {
          nombre:
            ((u.user_metadata as any)?.nombre as string | undefined) ?? null,
          email: u.email ?? '',
        },
      ]),
    )
    return elegibles
      .map((a) => ({
        id: a.id,
        nombre: byId.get(a.id)?.nombre ?? null,
        email: byId.get(a.id)?.email ?? '',
        rol: a.rol,
        sucursal_id: a.sucursal_id,
      }))
      .sort((x, y) =>
        (x.nombre || x.email).localeCompare(y.nombre || y.email),
      )
  } catch {
    return elegibles.map((a) => ({
      id: a.id,
      nombre: null,
      email: a.id,
      rol: a.rol,
      sucursal_id: a.sucursal_id,
    }))
  }
}

/** Mapa id → {nombre, email} para resolver en componentes cliente. */
export async function adminUsersMap(): Promise<
  Record<string, { nombre: string | null; email: string }>
> {
  const users = await listAdminUsers()
  return Object.fromEntries(
    users.map((u) => [u.id, { nombre: u.nombre, email: u.email }]),
  )
}
