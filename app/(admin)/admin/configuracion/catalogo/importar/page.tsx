import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { PageHeader } from '@/components/shared/page-header'

import { ImportarClient } from './importar-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Importar catálogo' }

export default async function ImportarCatalogoPage() {
  await requireAdminHubAccess({ allowedRoles: ['super_admin'] })
  return (
    <>
      <PageHeader
        title="Importar catálogo (CSV)"
        description="Subí el vademécum masivo: mapeá columnas, previsualizá y resolvé conflictos por SKU."
        breadcrumbs={[
          { label: 'Administración' },
          { label: 'Catálogo', href: '/admin/configuracion/catalogo' },
          { label: 'Importar' },
        ]}
      />
      <div className="p-4 md:p-6">
        <ImportarClient />
      </div>
    </>
  )
}
