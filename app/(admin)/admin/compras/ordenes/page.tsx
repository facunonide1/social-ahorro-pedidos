import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'
import { RubroFilter } from '@/components/compras/rubro-filter'
import { parseRubro } from '@/components/compras/rubro'
import { getSucursalActiva } from '@/lib/sucursal/server'
import { OrdenesClient, type OrdenRow } from './ordenes-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Órdenes de compra' }

export default async function OrdenesPage({ searchParams }: { searchParams: { rubro?: string } }) {
  await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'comprador', 'administrativo', 'auditor'] })
  const sb = createClient()
  const rubro = parseRubro(searchParams.rubro)
  const { sucursalId, esTodas } = getSucursalActiva()

  let q = sb.from('ordenes_compra')
    .select('id, codigo, rubro, estado, origen, total_estimado, condicion_pago, created_at, sucursal_compradora_id, proveedores(razon_social)')
    .order('created_at', { ascending: false }).limit(1000)
  if (rubro !== 'todos') q = q.eq('rubro', rubro)
  if (!esTodas && sucursalId) q = q.eq('sucursal_compradora_id', sucursalId)
  const [{ data }, { data: sucs }] = await Promise.all([q, sb.from('sucursales').select('id, nombre')])
  const sucMap = new Map(((sucs ?? []) as any[]).map((s) => [s.id, s.nombre]))

  // Estado de conciliación por orden: qué papel falta o si ya cuadró.
  const ordenIds = ((data ?? []) as any[]).map((o) => o.id)
  const { data: vinc } = ordenIds.length
    ? await sb
        .from('doc_conciliacion_ordenes')
        .select('orden_id, conciliacion_id, doc_conciliaciones(id, estado, monto_diferencia, doc_conciliacion_documentos(rol))')
        .in('orden_id', ordenIds)
    : { data: [] as any[] }

  const concPorOrden = new Map<string, OrdenRow['conciliacion']>()
  for (const v of (vinc ?? []) as any[]) {
    const c = v.doc_conciliaciones
    if (!c) continue
    const roles = ((c.doc_conciliacion_documentos ?? []) as any[]).map((d) => d.rol)
    concPorOrden.set(v.orden_id, {
      id: c.id,
      estado: c.estado,
      monto: Number(c.monto_diferencia ?? 0),
      falta: [!roles.includes('remito') && 'remito', !roles.includes('factura') && 'factura'].filter(Boolean) as string[],
    })
  }

  const rows: OrdenRow[] = ((data ?? []) as any[]).map((o) => ({
    id: o.id, codigo: o.codigo, rubro: o.rubro, estado: o.estado, origen: o.origen,
    total: Number(o.total_estimado ?? 0), condicion: o.condicion_pago,
    fecha: o.created_at, proveedor: o.proveedores?.razon_social ?? '—',
    sucursal: sucMap.get(o.sucursal_compradora_id) ?? '—',
    conciliacion: concPorOrden.get(o.id) ?? null,
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
