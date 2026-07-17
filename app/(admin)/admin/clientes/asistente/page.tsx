import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { PageHeader } from '@/components/shared/page-header'
import { NoraAcciones } from '@/components/nora/nora-acciones'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'NORA · Asistente' }

export default async function AsistenteClientesPage() {
  await requireAdminHubAccess()

  return (
    <>
      <PageHeader title="NORA · Asistente" description="Buscá y registrá clientes hablándole a NORA. Siempre confirmás antes de que se ejecute."
        breadcrumbs={[{ label: 'Clientes' }, { label: 'NORA' }]} />
      <div className="p-4 md:p-6">
        <NoraAcciones subapp="clientes" />
      </div>
    </>
  )
}
