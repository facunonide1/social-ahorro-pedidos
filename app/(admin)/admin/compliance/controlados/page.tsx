import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'
import { ControladosClient, type ControladoRow } from './controlados-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Productos controlados' }

export default async function ControladosPage() {
  const profile = await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'administrativo', 'auditor', 'encargado_sucursal'] })
  const adm = createAdminClient()
  const { data } = await adm.from('productos_catalogo').select('id, nombre, sku, lista_controlado, bloqueado_recall').eq('es_controlado', true).order('nombre').limit(1000)
  const rows: ControladoRow[] = ((data ?? []) as any[]).map((p) => ({ id: p.id, nombre: p.nombre, sku: p.sku, lista: p.lista_controlado, recall: !!p.bloqueado_recall }))
  const puedeEditar = ['super_admin', 'gerente', 'administrativo'].includes(profile.rol)

  return (
    <>
      <PageHeader title="Productos controlados" description="Marcá las especialidades de listas II/III/IV. Se distinguen con un chip en stock."
        breadcrumbs={[{ label: 'Compliance', href: '/admin/compliance' }, { label: 'Controlados' }]} />
      <div className="p-4 md:p-6"><ControladosClient rows={rows} puedeEditar={puedeEditar} /></div>
    </>
  )
}
