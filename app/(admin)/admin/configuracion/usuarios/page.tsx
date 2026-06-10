import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { AdminRole } from '@/lib/types/admin'
import type { PermisosCustom } from '@/lib/types/permisos'
import { PageHeader } from '@/components/shared/page-header'

import { UsuariosClient } from './usuarios-client'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Usuarios y permisos' }

export type UsuarioAdminRow = {
  id: string
  rol: AdminRole
  sucursal_id: string | null
  activo: boolean
  permisos_custom: PermisosCustom
  nombre: string | null
  email: string
  ultimo_login: string | null
  sucursal_nombre: string | null
}

export default async function UsuariosConfigPage() {
  await requireAdminHubAccess({ allowedRoles: ['super_admin'] })

  const sb = createClient()
  const { data: rows } = await sb
    .from('users_admin')
    .select('id, rol, sucursal_id, activo, permisos_custom, sucursales(nombre)')
    .order('activo', { ascending: false })
    .order('rol', { ascending: true })

  const { data: sucursalesData } = await sb
    .from('sucursales')
    .select('id, nombre, activa')
    .eq('activa', true)
    .order('nombre')

  // Enriquecer con auth (nombre, email, último login) en una sola llamada.
  const adm = createAdminClient()
  const authMap = new Map<
    string,
    { nombre: string | null; email: string; ultimo_login: string | null }
  >()
  try {
    const { data } = await adm.auth.admin.listUsers({ page: 1, perPage: 200 })
    for (const u of data?.users ?? []) {
      authMap.set(u.id, {
        nombre: ((u.user_metadata as any)?.nombre as string | undefined) ?? null,
        email: u.email ?? '',
        ultimo_login: u.last_sign_in_at ?? null,
      })
    }
  } catch {
    /* sin service role → email/nombre vacíos */
  }

  const usuarios: UsuarioAdminRow[] = ((rows ?? []) as any[]).map((r) => {
    const au = authMap.get(r.id)
    return {
      id: r.id,
      rol: r.rol,
      sucursal_id: r.sucursal_id,
      activo: r.activo,
      permisos_custom: (r.permisos_custom ?? {}) as PermisosCustom,
      nombre: au?.nombre ?? null,
      email: au?.email ?? '',
      ultimo_login: au?.ultimo_login ?? null,
      sucursal_nombre: r.sucursales?.nombre ?? null,
    }
  })

  const sucursales = ((sucursalesData ?? []) as any[]).map((s) => ({
    id: s.id as string,
    nombre: s.nombre as string,
  }))

  return (
    <>
      <PageHeader
        title="Usuarios y permisos"
        description="Altas, roles y permisos granulares de los usuarios de NORA HQ."
        breadcrumbs={[
          { label: 'Administración' },
          { label: 'Usuarios y permisos' },
        ]}
      />
      <div className="p-4 md:p-6">
        <UsuariosClient usuarios={usuarios} sucursales={sucursales} />
      </div>
    </>
  )
}
