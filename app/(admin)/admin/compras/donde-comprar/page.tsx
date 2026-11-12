import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { PageHeader } from '@/components/shared/page-header'

import { DondeComprarClient } from './donde-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Dónde lo compro más barato' }

export default async function DondeComprarPage() {
  await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'comprador'] })
  return (
    <>
      <PageHeader
        title="¿Dónde lo compro más barato?"
        description="Nombre, EAN o código. Precios de las listas vigentes, de menor a mayor."
        breadcrumbs={[{ label: 'Compras', href: '/admin/compras' }, { label: 'Dónde comprarlo' }]}
      />
      <div className="p-4 md:p-6">
        <DondeComprarClient />
      </div>
    </>
  )
}
