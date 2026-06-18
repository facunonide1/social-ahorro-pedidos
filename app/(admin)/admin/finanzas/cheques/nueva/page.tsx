import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'

import { PageHeader } from '@/components/shared/page-header'

import ChequeForm from './form'

export const dynamic = 'force-dynamic'

export default async function NuevoChequePage() {
  const profile = await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente', 'tesoreria'],
  })
  const sb = createClient()

  const [provRes, cuentasRes] = await Promise.all([
    sb
      .from('proveedores')
      .select('id, razon_social')
      .eq('activo', true)
      .order('razon_social'),
    sb
      .from('cuentas_bancarias_propias')
      .select('id, nombre, banco')
      .eq('activa', true)
      .order('nombre'),
  ])

  return (
    <>
      <PageHeader
        title="Nuevo cheque"
        breadcrumbs={[
          { label: 'Cheques', href: '/admin/finanzas/cheques' },
          { label: 'Nuevo' },
        ]}
      />
      <div className="mx-auto w-full max-w-2xl p-4 md:p-6">
        <ChequeForm
          proveedores={(provRes.data ?? []) as { id: string; razon_social: string }[]}
          cuentas={
            (cuentasRes.data ?? []) as { id: string; nombre: string; banco: string }[]
          }
        />
      </div>
    </>
  )
}
