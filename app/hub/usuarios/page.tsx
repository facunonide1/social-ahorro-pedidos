import { createClient, createAdminClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import type { Sucursal, UserAdmin } from '@/lib/types/admin'

import { HubShell } from '@/components/hub/hub-shell'
import { PageHeader } from '@/components/shared/page-header'

import UsuariosEditor from './editor'

export const dynamic = 'force-dynamic'

export type UsuarioRow = UserAdmin & {
  email: string
  nombre: string | null
  sucursal_nombre: string | null
}

type UsuarioRowRaw = UserAdmin & {
  sucursales?: { nombre: string | null } | null
}

export default async function UsuariosPage() {
  const profile = await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente'],
  })
  const sb = createClient()

  const { data: rows } = await sb
    .from('users_admin')
    .select('*, sucursales(nombre)')
    .order('activo', { ascending: false })
    .order('rol', { ascending: true })

  const admin = createAdminClient()
  const enriched: UsuarioRow[] = []
  for (const r of (rows ?? []) as UsuarioRowRaw[]) {
    const { data: au } = await admin.auth.admin.getUserById(r.id)
    const meta = au?.user?.user_metadata as { nombre?: string } | undefined
    enriched.push({
      ...r,
      email: au?.user?.email ?? '',
      nombre: meta?.nombre ?? null,
      sucursal_nombre: r.sucursales?.nombre ?? null,
    })
  }

  const { data: sucursales } = await sb
    .from('sucursales')
    .select('id, nombre, activa')
    .order('activa', { ascending: false })
    .order('nombre')

  return (
    <HubShell profile={profile}>
      <PageHeader
        title="Usuarios del Admin Hub"
        description={`${enriched.length} usuario${enriched.length === 1 ? '' : 's'}`}
      />

      <div className="mx-auto w-full max-w-5xl p-4 md:p-6">
        <UsuariosEditor
          initialUsers={enriched}
          sucursales={(sucursales ?? []) as Pick<Sucursal, 'id' | 'nombre' | 'activa'>[]}
          currentUserId={profile.id}
        />
      </div>
    </HubShell>
  )
}
