import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'

import { PageHeader } from '@/components/shared/page-header'

import NuevaRecepcionForm from './form'

export const dynamic = 'force-dynamic'

export default async function NuevaRecepcionPage() {
  const profile = await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente', 'administrativo', 'sucursal'],
  })
  const sb = createClient()

  const { data: sucursales } = await sb
    .from('sucursales')
    .select('id, nombre')
    .eq('activa', true)
    .order('nombre', { ascending: true })

  return (
    <>
      <PageHeader
        title="Nueva recepción"
        description="Cargá los items y las cantidades. El estado se calcula automáticamente."
        breadcrumbs={[
          { label: 'Recepciones', href: '/hub/recepciones' },
          { label: 'Nueva' },
        ]}
      />

      <div className="mx-auto w-full max-w-5xl p-4 md:p-6">
        <NuevaRecepcionForm
          sucursales={(sucursales ?? []) as { id: string; nombre: string }[]}
          forcedSucursalId={profile.rol === 'sucursal' ? profile.sucursal_id : null}
        />
      </div>
    </>
  )
}
