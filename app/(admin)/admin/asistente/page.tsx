import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { PageHeader } from '@/components/shared/page-header'
import { NoraAcciones } from '@/components/nora/nora-acciones'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'NORA · Asistente' }

/**
 * Asistente GLOBAL (Mission Control). Ve las herramientas transversales
 * (resumen del día, lo urgente) + las lecturas cruzables (lecturaGlobal) de
 * todos los sectores que el usuario puede ver.
 */
export default async function AsistenteGlobalPage() {
  await requireAdminHubAccess()

  return (
    <>
      <PageHeader title="NORA · Asistente" description="Pedile a NORA el estado del día, lo urgente, o cualquier consulta de tus sectores. Siempre confirmás antes de ejecutar."
        breadcrumbs={[{ label: 'Mission Control' }, { label: 'NORA' }]} />
      <div className="p-4 md:p-6">
        <NoraAcciones subapp="mission_control" />
      </div>
    </>
  )
}
