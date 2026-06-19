import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'
import { RubroFilter, parseRubro } from '@/components/compras/rubro-filter'
import { OrdenesClient, type OrdenRow } from './ordenes-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Órdenes de compra' }

export default async function OrdenesPage({ searchParams }: { searchParams: { rubro?: string } }) {
  await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'comprador', 'administrativo', 'auditor'] })
  const sb = createClient()
  const rubro = parseRubro(searchParams.rubro)

  let q = sb.from('ordenes_compra')
    .select('id, codigo, rubro, estado, origen, total_estimado, condicion_pago, created_at, sucursal_compradora_id, proveedores(razon_social)')
    .order('created_at', { ascending: false }).limit(1000)
  if (rubro !== 'todos') q = q.eq('rubro', rubro)
  const [{ data }, { data: sucs }] = await Promise.all([q, sb.from('sucursales').select('id, nombre')])
  const sucMap = new Map(((sucs ?? []) as any[]).map((s) => [s.id, s.nombre]))

  const rows: OrdenRow[] = ((data ?? []) as any[]).map((o) => ({
    id: o.id, codigo: o.codigo, rubro: o.rubro, estado: o.estado, origen: o.origen,
    total: Number(o.total_estimado ?? 0), condicion: o.condicion_pago,
    fecha: o.created_at, proveedor: o.proveedores?.razon_social ?? '—',
    sucursal: sucMap.get(o.sucursal_compradora_id) ?? '—',
  }))

  return (
    <>
      <PageHeader title="Órdenes de compra" description="Órdenes multisucursal con distribución y transferencias automáticas al recibir."
        breadcrumbs={[{ label: 'Compras' }, { label: 'Órdenes' }]} />
      <div className="space-y-4 p-4 md:p-6">
        <RubroFilter />
        <OrdenesClient ordenes={rows} />
      </div>
    </>
  )
}
