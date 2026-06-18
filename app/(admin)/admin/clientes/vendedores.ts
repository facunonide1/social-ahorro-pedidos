import { createClient, createAdminClient } from '@/lib/supabase/server'

export type VendedorOption = {
  id: string
  nombre: string | null
  email: string
}

const VENDEDOR_ROLES = ['super_admin', 'gerente', 'administrativo', 'comprador']

/**
 * Lista de usuarios admin que pueden ser "vendedor asignado" de un
 * cliente. Los nombres viven en auth.users — los resolvemos con
 * service role.
 */
export async function listVendedores(): Promise<VendedorOption[]> {
  const sb = createClient()
  const { data: admins } = await sb
    .from('users_admin')
    .select('id, rol, activo')
    .eq('activo', true)
  const elegibles = (admins ?? []).filter((a: any) =>
    VENDEDOR_ROLES.includes(a.rol),
  )
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
      .map((a: any) => ({
        id: a.id,
        nombre: byId.get(a.id)?.nombre ?? null,
        email: byId.get(a.id)?.email ?? '',
      }))
      .sort((x, y) =>
        (x.nombre || x.email).localeCompare(y.nombre || y.email),
      )
  } catch {
    return elegibles.map((a: any) => ({ id: a.id, nombre: null, email: a.id }))
  }
}
