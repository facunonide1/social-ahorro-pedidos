import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'

import { HubShell } from '@/components/hub/hub-shell'
import { PageHeader } from '@/components/shared/page-header'

import NuevaFacturaForm from './form'

export const dynamic = 'force-dynamic'

export default async function NuevaFacturaPage() {
  const profile = await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente', 'administrativo', 'tesoreria'],
  })
  const sb = createClient()

  const [provRes, sucRes] = await Promise.all([
    sb
      .from('proveedores')
      .select('id, razon_social, plazo_pago_dias')
      .eq('activo', true)
      .order('razon_social'),
    sb.from('sucursales').select('id, nombre').eq('activa', true).order('nombre'),
  ])

  return (
    <HubShell profile={profile}>
      <PageHeader
        title="Nueva factura"
        breadcrumbs={[
          { label: 'Facturas', href: '/hub/facturas' },
          { label: 'Nueva' },
        ]}
      />

      <div className="mx-auto w-full max-w-4xl p-4 md:p-6">
        <NuevaFacturaForm
          proveedores={
            (provRes.data ?? []) as { id: string; razon_social: string; plazo_pago_dias: number }[]
          }
          sucursales={(sucRes.data ?? []) as { id: string; nombre: string }[]}
        />
      </div>
    </HubShell>
  )
}
