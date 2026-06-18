import { requireAdminHubAccess } from '@/lib/admin-hub/auth'

import { PageHeader } from '@/components/shared/page-header'

import NuevoProveedorForm from './form'

export const dynamic = 'force-dynamic'

export default async function NuevoProveedorPage() {
  const profile = await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente', 'comprador', 'administrativo'],
  })

  return (
    <>
      <PageHeader
        title="Nuevo proveedor"
        description="Los contactos, cuentas bancarias y documentos se cargan en la ficha después de crearlo."
        breadcrumbs={[
          { label: 'Proveedores', href: '/hub/proveedores' },
          { label: 'Nuevo' },
        ]}
      />

      <div className="mx-auto w-full max-w-3xl p-4 md:p-6">
        <NuevoProveedorForm />
      </div>
    </>
  )
}
