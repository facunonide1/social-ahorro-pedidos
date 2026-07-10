import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { PageHeader } from '@/components/shared/page-header'
import { AgendaClient } from './agenda-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Agenda de NORA' }

export default async function AgendaPage() {
  await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'sucursal', 'encargado_sucursal', 'administrativo', 'auditor'] })
  return (
    <>
      <PageHeader title="Agenda del día — propuesta por NORA"
        description="NORA arma la agenda cruzando vencimientos, faltantes e irregularidades. Ajustá y creá las tareas."
        breadcrumbs={[{ label: 'Operación', href: '/admin/operaciones' }, { label: 'Tareas', href: '/admin/tareas' }, { label: 'Agenda' }]} />
      <div className="p-4 md:p-6"><AgendaClient /></div>
    </>
  )
}
