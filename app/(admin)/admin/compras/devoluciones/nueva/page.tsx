import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'

import { PageHeader } from '@/components/shared/page-header'

import DevolucionForm from './form'

export const dynamic = 'force-dynamic'

export default async function NuevaDevolucionPage() {
  const profile = await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente', 'comprador', 'administrativo'],
  })
  const sb = createClient()

  const [provRes, sucRes, prodRes] = await Promise.all([
    sb
      .from('proveedores')
      .select('id, razon_social')
      .eq('activo', true)
      .order('razon_social'),
    sb.from('sucursales').select('id, nombre').eq('activa', true).order('nombre'),
    sb
      .from('productos')
      .select('id, nombre')
      .eq('activo', true)
      .order('nombre')
      .limit(500),
  ])

  return (
    <>
      <PageHeader
        title="Nueva devolución a proveedor"
        breadcrumbs={[
          { label: 'Devoluciones', href: '/admin/compras/devoluciones' },
          { label: 'Nueva' },
        ]}
      />
      <div className="mx-auto w-full max-w-3xl p-4 md:p-6">
        <DevolucionForm
          proveedores={(provRes.data ?? []) as { id: string; razon_social: string }[]}
          sucursales={(sucRes.data ?? []) as { id: string; nombre: string }[]}
          productos={(prodRes.data ?? []) as { id: string; nombre: string }[]}
        />
      </div>
    </>
  )
}
