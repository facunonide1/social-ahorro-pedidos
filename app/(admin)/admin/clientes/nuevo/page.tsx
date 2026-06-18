import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'

import { PageHeader } from '@/components/shared/page-header'
import { ClienteForm } from '../cliente-form'
import { listVendedores } from '../vendedores'

export const dynamic = 'force-dynamic'

export default async function NuevoClientePage() {
  const profile = await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente', 'administrativo'],
  })
  const sb = createClient()

  const [{ data: sucursales }, vendedores] = await Promise.all([
    sb.from('sucursales').select('id, nombre').eq('activa', true).order('nombre'),
    listVendedores(),
  ])

  return (
    <>
      <PageHeader
        title="Nuevo cliente B2B"
        breadcrumbs={[
          { label: 'Comercial' },
          { label: 'Clientes', href: '/hub/clientes' },
          { label: 'Nuevo' },
        ]}
      />
      <div className="mx-auto max-w-3xl p-4 md:p-6">
        <ClienteForm
          sucursales={(sucursales ?? []) as { id: string; nombre: string }[]}
          vendedores={vendedores}
        />
      </div>
    </>
  )
}
