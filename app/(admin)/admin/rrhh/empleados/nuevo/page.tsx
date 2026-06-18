import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'

import { PageHeader } from '@/components/shared/page-header'
import { EmpleadoForm } from '../empleado-form'

export const dynamic = 'force-dynamic'

export default async function NuevoEmpleadoPage() {
  const profile = await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente', 'administrativo'],
  })
  const sb = createClient()
  const { data: sucursales } = await sb
    .from('sucursales')
    .select('id, nombre')
    .eq('activa', true)
    .order('nombre')

  return (
    <>
      <PageHeader
        title="Nuevo empleado"
        breadcrumbs={[
          { label: 'RRHH' },
          { label: 'Empleados', href: '/hub/rrhh/empleados' },
          { label: 'Nuevo' },
        ]}
      />
      <div className="mx-auto max-w-3xl p-4 md:p-6">
        <EmpleadoForm
          sucursales={(sucursales ?? []) as { id: string; nombre: string }[]}
        />
      </div>
    </>
  )
}
