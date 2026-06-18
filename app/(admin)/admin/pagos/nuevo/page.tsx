import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'

import { PageHeader } from '@/components/shared/page-header'

import NuevoPagoForm from './form'

export const dynamic = 'force-dynamic'

export default async function NuevoPagoPage() {
  const profile = await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente', 'tesoreria'],
  })
  const sb = createClient()

  const { data: proveedores } = await sb
    .from('proveedores')
    .select('id, razon_social, cuit')
    .eq('activo', true)
    .order('razon_social', { ascending: true })

  return (
    <>
      <PageHeader
        title="Nueva orden de pago"
        description="Elegí un proveedor, seleccioná las facturas a cancelar e informá el método."
        breadcrumbs={[
          { label: 'Pagos', href: '/hub/pagos' },
          { label: 'Nueva' },
        ]}
      />

      <div className="mx-auto w-full max-w-5xl p-4 md:p-6">
        <NuevoPagoForm
          proveedores={
            (proveedores ?? []) as { id: string; razon_social: string; cuit: string }[]
          }
        />
      </div>
    </>
  )
}
