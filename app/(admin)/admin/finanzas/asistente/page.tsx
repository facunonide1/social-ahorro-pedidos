import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { PageHeader } from '@/components/shared/page-header'
import { NoraAcciones } from '@/components/nora/nora-acciones'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'NORA · Asistente' }

export default async function AsistenteFinanzasPage() {
  // Había un 'encargado' acá que no existe en AdminRole (el rol real es
  // 'encargado_sucursal'), así que nunca matcheó y no daba acceso a nadie.
  // Se quita para dejar el acceso como está hoy — si la intención era incluir
  // a encargado_sucursal, es una decisión de permisos, no un arreglo de tipos.
  await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'tesoreria', 'auditor'] })

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
