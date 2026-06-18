import { requireAdminHubAccess } from '@/lib/admin-hub/auth'

import { PageHeader } from '@/components/shared/page-header'

import CuentaForm from './form'

export const dynamic = 'force-dynamic'

export default async function NuevaCuentaPage() {
  const profile = await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente', 'tesoreria'],
  })

  return (
    <>
      <PageHeader
        title="Nueva cuenta bancaria"
        breadcrumbs={[
          { label: 'Cuentas bancarias', href: '/admin/finanzas/cuentas' },
          { label: 'Nueva' },
        ]}
      />
      <div className="mx-auto w-full max-w-2xl p-4 md:p-6">
        <CuentaForm mode="create" />
      </div>
    </>
  )
}
