import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'

import { HubShell } from '@/components/hub/hub-shell'
import { PageHeader } from '@/components/shared/page-header'

import TransferenciaForm from './form'

export const dynamic = 'force-dynamic'

export default async function NuevaTransferenciaPage() {
  const profile = await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente', 'administrativo', 'sucursal'],
  })
  const sb = createClient()

  const [sucRes, prodRes] = await Promise.all([
    sb.from('sucursales').select('id, nombre').eq('activa', true).order('nombre'),
    sb
      .from('productos')
      .select('id, nombre, codigo_interno')
      .eq('activo', true)
      .order('nombre')
      .limit(500),
  ])

  return (
    <HubShell profile={profile}>
      <PageHeader
        title="Nueva transferencia"
        breadcrumbs={[
          { label: 'Transferencias', href: '/hub/operaciones/transferencias' },
          { label: 'Nueva' },
        ]}
      />
      <div className="mx-auto w-full max-w-3xl p-4 md:p-6">
        <TransferenciaForm
          sucursales={(sucRes.data ?? []) as { id: string; nombre: string }[]}
          productos={
            (prodRes.data ?? []) as {
              id: string
              nombre: string
              codigo_interno: string | null
            }[]
          }
        />
      </div>
    </HubShell>
  )
}
