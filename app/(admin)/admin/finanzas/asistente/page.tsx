import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { PageHeader } from '@/components/shared/page-header'
import { NoraAcciones } from '@/components/nora/nora-acciones'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'NORA · Asistente' }

export default async function AsistenteFinanzasPage() {
  await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'tesoreria', 'auditor', 'encargado'] })

  return (
    <>
      <PageHeader title="NORA · Asistente" description="Pedile a NORA que haga cosas por vos. Siempre confirmás antes de que se ejecute."
        breadcrumbs={[{ label: 'Finanzas' }, { label: 'NORA' }]} />
      <div className="p-4 md:p-6">
        <NoraAcciones subapp="finanzas" />
      </div>
    </>
  )
}
