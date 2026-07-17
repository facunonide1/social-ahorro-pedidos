import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { PageHeader } from '@/components/shared/page-header'
import { NoraAcciones } from '@/components/nora/nora-acciones'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'NORA · Asistente' }

export default async function AsistenteOfertasPage() {
  await requireAdminHubAccess()

  return (
    <>
      <PageHeader title="NORA · Asistente" description="Armá ofertas (quedan a aprobación) y consultá el calendario comercial hablándole a NORA."
        breadcrumbs={[{ label: 'Ofertas' }, { label: 'NORA' }]} />
      <div className="p-4 md:p-6">
        <NoraAcciones subapp="ofertas" />
      </div>
    </>
  )
}
