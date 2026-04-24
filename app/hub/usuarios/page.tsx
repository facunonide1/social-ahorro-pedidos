import { createClient, createAdminClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import type { Sucursal, UserAdmin, AdminRole } from '@/lib/types/admin'
import HubSidebar from '../_components/sidebar'
import UsuariosEditor from './editor'

export const dynamic = 'force-dynamic'

export type UsuarioRow = UserAdmin & {
  email: string
  nombre: string | null
  sucursal_nombre: string | null
}

export default async function UsuariosPage() {
  const profile = await requireAdminHubAccess({ allowedRoles: ['super_admin','gerente'] })
  const sb = createClient()

  const { data: rows } = await sb
    .from('users_admin')
    .select('*, sucursales(nombre)')
    .order('activo', { ascending: false })
    .order('rol', { ascending: true })

  // Para traer email y nombre de cada user (que viven en auth.users), usamos
  // service role: las APIs de auth.admin no son consultables vía RLS.
  const admin = createAdminClient()
  const ids = (rows ?? []).map((r: any) => r.id)
  const enriched: UsuarioRow[] = []
  for (const r of (rows ?? []) as any[]) {
    const { data: au } = await admin.auth.admin.getUserById(r.id)
    enriched.push({
      ...r,
      email: au?.user?.email ?? '',
      nombre: (au?.user?.user_metadata as any)?.nombre ?? null,
      sucursal_nombre: r.sucursales?.nombre ?? null,
    })
  }

  const { data: sucursales } = await sb
    .from('sucursales').select('id, nombre, activa').order('activa', { ascending: false }).order('nombre')

  return (
    <div style={{ minHeight: '100vh', background: '#faf8f5', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', color: '#2a2a2a', display: 'flex' }}>
      <HubSidebar profile={profile} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <header style={{ background: '#fff', borderBottom: '0.5px solid #ede9e4', padding: '16px 24px' }}>
          <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.4px' }}>Usuarios del Admin Hub</div>
          <div style={{ fontSize: 12, color: '#888' }}>{enriched.length} usuario{enriched.length === 1 ? '' : 's'}</div>
        </header>

        <main style={{ padding: 20, maxWidth: 980 }}>
          <UsuariosEditor
            initialUsers={enriched}
            sucursales={(sucursales ?? []) as Pick<Sucursal,'id'|'nombre'|'activa'>[]}
            currentUserId={profile.id}
          />
        </main>
      </div>
    </div>
  )
}
