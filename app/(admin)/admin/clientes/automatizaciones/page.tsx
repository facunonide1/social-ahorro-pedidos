import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'
import type { Automatizacion } from '@/lib/types/crm'
import { AutomatizacionesClient } from './automatizaciones-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Automatizaciones · CRM' }

export default async function AutomatizacionesPage() {
  await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'marketing', 'administrativo', 'auditor'] })
  const sb = createClient()
  const { data } = await sb.from('automatizaciones').select('*').order('created_at', { ascending: false })
  return (
    <>
      <PageHeader title="Automatizaciones" description="Mensajes que se disparan solos: cumpleaños, reactivación, recompra de crónicos."
        breadcrumbs={[{ label: 'Comercial' }, { label: 'Clientes', href: '/admin/clientes' }, { label: 'Automatizaciones' }]} />
      <div className="p-4 md:p-6">
        <AutomatizacionesClient autos={(data ?? []) as Automatizacion[]} />
      </div>
    </>
  )
}
