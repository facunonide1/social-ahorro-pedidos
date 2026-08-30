import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'
import { ControladosClient, type ControladoRow } from './controlados-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Productos controlados' }

export default async function ControladosPage() {
  const profile = await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'administrativo', 'auditor', 'encargado_sucursal'] })
  const adm = createAdminClient()
  // El limite estaba en 1000 cuando no habia ni un controlado cargado. Con el
  // maestro de SIFACO son 3.649: mostrar mil sin decirlo era ocultar dos mil
  // seiscientos productos de control legal. Se traen todos y, si alguna vez el
  // tope se alcanza, la pantalla lo dice en vez de callarse.
  const TOPE = 5000
  const [{ data }, { count: total }] = await Promise.all([
    adm.from('productos_catalogo').select('id, nombre, sku, lista_controlado, bloqueado_recall').eq('es_controlado', true).order('nombre').limit(TOPE),
    adm.from('productos_catalogo').select('id', { count: 'exact', head: true }).eq('es_controlado', true),
  ])
  const rows: ControladoRow[] = ((data ?? []) as any[]).map((p) => ({ id: p.id, nombre: p.nombre, sku: p.sku, lista: p.lista_controlado, recall: !!p.bloqueado_recall }))
  const puedeEditar = ['super_admin', 'gerente', 'administrativo'].includes(profile.rol)

  return (
    <>
      <PageHeader title="Productos controlados" description={`${(total ?? 0).toLocaleString('es-AR')} productos bajo control, marcados por nivel desde el maestro de SIFACO.${(total ?? 0) > TOPE ? ` Se muestran los primeros ${TOPE.toLocaleString('es-AR')}.` : ''} Se distinguen con un chip en stock.`}
        breadcrumbs={[{ label: 'Compliance', href: '/admin/compliance' }, { label: 'Controlados' }]} />
      <div className="p-4 md:p-6"><ControladosClient rows={rows} puedeEditar={puedeEditar} /></div>
    </>
  )
}
