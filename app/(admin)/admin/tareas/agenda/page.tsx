import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { listAdminUsers } from '@/lib/admin-hub/users'
import { PageHeader } from '@/components/shared/page-header'
import { AgendaClient } from './agenda-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Agenda de NORA' }

export default async function AgendaPage() {
  await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'sucursal', 'encargado_sucursal', 'administrativo', 'auditor'] })
  const sb = createClient()
  const [users, { data: sucursales }] = await Promise.all([
    listAdminUsers(),
    sb.from('sucursales').select('id, nombre').eq('activa', true).order('nombre'),
  ])
  return (
    <>
      <PageHeader title="Agenda del día — propuesta por NORA"
        description="NORA arma la agenda cruzando vencimientos, faltantes e irregularidades. Ajustá, asigná y publicá."
        breadcrumbs={[{ label: 'Operación', href: '/admin/operaciones' }, { label: 'Tareas', href: '/admin/tareas' }, { label: 'Agenda' }]} />
      <div className="p-4 md:p-6">
        <AgendaClient
          users={users.map((u) => ({ id: u.id, nombre: u.nombre || u.email }))}
          sucursales={(sucursales ?? []) as { id: string; nombre: string }[]}
        />
      </div>
    </>
  )
}
