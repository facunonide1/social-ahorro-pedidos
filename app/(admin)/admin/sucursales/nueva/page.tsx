import { requireAdminHubAccess } from '@/lib/admin-hub/auth'

import { PageHeader } from '@/components/shared/page-header'

import SucursalForm from '../sucursal-form'

export const dynamic = 'force-dynamic'

export default async function NuevaSucursalPage() {
  const profile = await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente'],
  })

  return (
    <>
      <PageHeader
        title="Nueva sucursal"
        breadcrumbs={[
          { label: 'Sucursales', href: '/hub/sucursales' },
          { label: 'Nueva' },
        ]}
      />

      <div className="mx-auto w-full max-w-3xl p-4 md:p-6">
        <SucursalForm mode="create" />
      </div>
    </>
  )
}
