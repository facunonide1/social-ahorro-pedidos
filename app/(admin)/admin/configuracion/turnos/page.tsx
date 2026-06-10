import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import type { TurnoSucursal } from '@/lib/types/tareas-enterprise'
import { PageHeader } from '@/components/shared/page-header'

import { TurnosClient } from './turnos-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Turnos por sucursal' }

export default async function TurnosPage() {
  await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente'] })

  const sb = createClient()
  const [{ data: sucs }, { data: turnos }] = await Promise.all([
    sb.from('sucursales').select('id, nombre, codigo').eq('activa', true).order('nombre'),
    sb
      .from('turnos_sucursal')
      .select('*')
      .order('sucursal_id')
      .order('orden'),
  ])

  return (
    <>
      <PageHeader
        title="Turnos por sucursal"
        description="Cada farmacia define sus turnos. Las tareas de pool se asignan por turno."
        breadcrumbs={[{ label: 'Administración' }, { label: 'Turnos' }]}
      />
      <div className="p-4 md:p-6">
        <TurnosClient
          sucursales={(sucs ?? []) as { id: string; nombre: string; codigo: string | null }[]}
          turnos={(turnos ?? []) as TurnoSucursal[]}
        />
      </div>
    </>
  )
}
