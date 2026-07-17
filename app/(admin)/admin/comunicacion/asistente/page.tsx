import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { PageHeader } from '@/components/shared/page-header'
import { NoraAcciones } from '@/components/nora/nora-acciones'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'NORA · Asistente' }

export default async function AsistenteComunicacionPage() {
  await requireAdminHubAccess()

  return (
    <>
      <PageHeader title="NORA · Asistente" description="Mandá mensajes, comunicados y encuestas, y buscá en las conversaciones hablándole a NORA."
        breadcrumbs={[{ label: 'Comunicación' }, { label: 'NORA' }]} />
      <div className="p-4 md:p-6">
        <NoraAcciones subapp="comunicacion" />
      </div>
    </>
  )
}
