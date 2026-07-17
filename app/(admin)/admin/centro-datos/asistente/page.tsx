import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { PageHeader } from '@/components/shared/page-header'
import { NoraAcciones } from '@/components/nora/nora-acciones'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'NORA · Asistente' }

export default async function AsistenteCentroDatosPage() {
  await requireAdminHubAccess()

  return (
    <>
      <PageHeader title="NORA · Asistente" description="Consultá el estado de las importaciones hablándole a NORA."
        breadcrumbs={[{ label: 'Centro de Datos' }, { label: 'NORA' }]} />
      <div className="p-4 md:p-6">
        <NoraAcciones subapp="centro-datos" />
      </div>
    </>
  )
}
