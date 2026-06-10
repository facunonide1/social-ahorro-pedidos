import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { listAdminUsers } from '@/lib/admin-hub/users'
import type { SupervisorTarea } from '@/lib/types/tareas-enterprise'
import { PageHeader } from '@/components/shared/page-header'

import { SupervisoresClient } from './supervisores-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Supervisores de tareas' }

export default async function SupervisoresPage() {
  const profile = await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente'] })

  const sb = createClient()
  const [{ data: sucs }, { data: sups }, users] = await Promise.all([
    sb.from('sucursales').select('id, nombre, codigo').eq('activa', true).order('nombre'),
    sb.from('supervisores_tareas').select('*').eq('activo', true).order('created_at', { ascending: false }),
    listAdminUsers(),
  ])

  return (
    <>
      <PageHeader
        title="Supervisores de tareas"
        description="Un supervisor por sucursal aprueba las tareas. Independiente del cargo."
        breadcrumbs={[{ label: 'Administración' }, { label: 'Supervisores' }]}
      />
      <div className="p-4 md:p-6">
        <SupervisoresClient
          sucursales={(sucs ?? []) as { id: string; nombre: string; codigo: string | null }[]}
          supervisores={(sups ?? []) as SupervisorTarea[]}
          users={users}
          currentUserId={profile.id}
        />
      </div>
    </>
  )
}
