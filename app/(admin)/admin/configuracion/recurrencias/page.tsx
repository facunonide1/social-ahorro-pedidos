import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { listAdminUsers } from '@/lib/admin-hub/users'
import type { TurnoSucursal } from '@/lib/types/tareas-enterprise'
import { PageHeader } from '@/components/shared/page-header'
import { RegenerarAgendaButton } from '@/components/tareas/regenerar-agenda-button'

import { RecurrenciasClient } from './recurrencias-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Recurrencias' }

export default async function RecurrenciasPage() {
  const profile = await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente'] })

  const sb = createClient()
  const [{ data: recs }, { data: tipos }, { data: sucs }, { data: turnos }, users] =
    await Promise.all([
      sb.from('tareas_recurrencias').select('*').order('created_at', { ascending: false }),
      sb.from('tipos_tareas').select('id, nombre, codigo').eq('activo', true).order('nombre'),
      sb.from('sucursales').select('id, nombre, codigo').eq('activa', true).order('nombre'),
      sb.from('turnos_sucursal').select('*').eq('activo', true).order('orden'),
      listAdminUsers(),
    ])

  return (
    <>
      <PageHeader
        title="Recurrencias"
        description="Plantillas que generan tareas automáticamente cada día/semana/mes."
        breadcrumbs={[{ label: 'Administración' }, { label: 'Recurrencias' }]}
        actions={profile.rol === 'super_admin' ? <RegenerarAgendaButton /> : undefined}
      />
      <div className="p-4 md:p-6">
        <RecurrenciasClient
          recurrencias={(recs ?? []) as any[]}
          tipos={(tipos ?? []) as { id: string; nombre: string; codigo: string }[]}
          sucursales={(sucs ?? []) as { id: string; nombre: string; codigo: string | null }[]}
          turnos={(turnos ?? []) as TurnoSucursal[]}
          users={users}
        />
      </div>
    </>
  )
}
