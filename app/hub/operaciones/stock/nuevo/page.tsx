import { requireAdminHubAccess } from '@/lib/admin-hub/auth'

import { HubShell } from '@/components/hub/hub-shell'
import { PageHeader } from '@/components/shared/page-header'

import ProductoForm from './form'

export const dynamic = 'force-dynamic'

export default async function NuevoProductoPage() {
  const profile = await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente', 'comprador', 'administrativo'],
  })

  return (
    <HubShell profile={profile}>
      <PageHeader
        title="Nuevo producto"
        breadcrumbs={[
          { label: 'Stock', href: '/hub/operaciones/stock' },
          { label: 'Nuevo' },
        ]}
      />
      <div className="mx-auto w-full max-w-2xl p-4 md:p-6">
        <ProductoForm mode="create" />
      </div>
    </HubShell>
  )
}
