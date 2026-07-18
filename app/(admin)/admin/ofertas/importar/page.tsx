import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { PageHeader } from '@/components/shared/page-header'
import { ImportarOfertasClient } from './importar-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Importar ofertas' }

export default async function ImportarOfertasPage() {
  await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'administrativo'] })
  return (
    <>
      <PageHeader title="Importar ofertas" description="Subí un archivo (SKU o EAN + precio + vigencia). Se crean ofertas en BORRADOR para aprobar; los que no matchean van a la cola Sin matchear."
        breadcrumbs={[{ label: 'Ofertas', href: '/admin/ofertas' }, { label: 'Importar' }]} />
      <div className="mx-auto w-full max-w-3xl p-4 md:p-6">
        <ImportarOfertasClient />
      </div>
    </>
  )
}
