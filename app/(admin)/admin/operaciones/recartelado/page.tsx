import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { getSucursalActiva } from '@/lib/sucursal/server'
import { PageHeader } from '@/components/shared/page-header'

import { RecarteladoClient, type ListaRecartelado } from './recartelado-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Recartelado' }

export default async function RecarteladoPage() {
  await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'sucursal', 'encargado_sucursal', 'administrativo', 'auditor'] })
  const adm = createAdminClient()
  const { sucursalId, esTodas } = getSucursalActiva()
  const desde = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)

  let q = adm.from('listas_recartelado')
    .select('id, sucursal_id, fecha, estado, tarea_id, sucursales(nombre), recartelado_items(id, nombre, sku, precio_viejo, precio_nuevo, estado)')
    .eq('es_demo', false).gte('fecha', desde).order('fecha', { ascending: false })
  if (!esTodas && sucursalId) q = q.eq('sucursal_id', sucursalId)
  const { data } = await q

  const listas: ListaRecartelado[] = ((data ?? []) as any[]).map((l) => ({
    id: l.id, sucursal_id: l.sucursal_id, sucursal: l.sucursales?.nombre ?? '—', fecha: l.fecha, estado: l.estado, tarea_id: l.tarea_id,
    items: ((l.recartelado_items ?? []) as any[]).map((i) => ({ id: i.id, nombre: i.nombre, sku: i.sku, precio_viejo: Number(i.precio_viejo), precio_nuevo: Number(i.precio_nuevo), estado: i.estado })),
  }))

  return (
    <>
      <PageHeader title="Recartelado" description="Carteles de góndola a cambiar por precios nuevos del import. Solo lo que está en góndola."
        breadcrumbs={[{ label: 'Operación', href: '/admin/operaciones' }, { label: 'Recartelado' }]} />
      <div className="p-4 md:p-6"><RecarteladoClient listas={listas} /></div>
    </>
  )
}
