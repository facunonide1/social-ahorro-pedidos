import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'
import { RubroFilter } from '@/components/compras/rubro-filter'
import { parseRubro } from '@/components/compras/rubro'
import { getSucursalActiva } from '@/lib/sucursal/server'
import { RecepcionesClient, type OrdenRecibible, type RecepRow } from './recepciones-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Recepciones' }

const RECIBIBLES = ['enviada', 'confirmada', 'recibida_parcial']

export default async function RecepcionesComprasPage({ searchParams }: { searchParams: { rubro?: string } }) {
  await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'comprador', 'administrativo', 'sucursal', 'auditor'] })
  const sb = createClient()
  const rubro = parseRubro(searchParams.rubro)
  const { sucursalId, esTodas } = getSucursalActiva()

  let oq = sb.from('ordenes_compra').select('id, codigo, rubro, estado, sucursal_compradora_id, proveedores(razon_social)').in('estado', RECIBIBLES).order('created_at', { ascending: false }).limit(500)
  if (rubro !== 'todos') oq = oq.eq('rubro', rubro)
  if (!esTodas && sucursalId) oq = oq.eq('sucursal_compradora_id', sucursalId)
  let recepQ = sb.from('recepciones_mercaderia').select('id, numero_remito, fecha_recepcion, estado, orden_compra_id, ordenes_compra(codigo), sucursales(nombre)').not('orden_compra_id', 'is', null).order('fecha_recepcion', { ascending: false }).limit(200)
  if (!esTodas && sucursalId) recepQ = recepQ.eq('sucursal_id', sucursalId)

  const [{ data: ords }, { data: items }, { data: sucs }, { data: receps }] = await Promise.all([
    oq,
    sb.from('orden_compra_items').select('orden_id, producto_id, descripcion, cantidad_total, costo_unitario, productos_catalogo(nombre, sku)').limit(5000),
    sb.from('sucursales').select('id, nombre'),
    recepQ,
  ])

  const sucMap = new Map(((sucs ?? []) as any[]).map((s) => [s.id, s.nombre]))
  const itemsByOrden = new Map<string, any[]>()
  for (const it of (items ?? []) as any[]) {
    const arr = itemsByOrden.get(it.orden_id) ?? []
    arr.push({ producto_id: it.producto_id, nombre: it.productos_catalogo?.nombre ?? it.descripcion ?? '—', sku: it.productos_catalogo?.sku ?? null, cantidad: Number(it.cantidad_total), costo: Number(it.costo_unitario) })
    itemsByOrden.set(it.orden_id, arr)
  }

  const ordenes: OrdenRecibible[] = ((ords ?? []) as any[]).map((o) => ({
    id: o.id, codigo: o.codigo, estado: o.estado, proveedor: o.proveedores?.razon_social ?? '—',
    sucursal: sucMap.get(o.sucursal_compradora_id) ?? '—', items: itemsByOrden.get(o.id) ?? [],
  }))
  const recepciones: RecepRow[] = ((receps ?? []) as any[]).map((r) => ({
    id: r.id, remito: r.numero_remito, fecha: r.fecha_recepcion, estado: r.estado,
    orden: r.ordenes_compra?.codigo ?? '—', sucursal: r.sucursales?.nombre ?? '—',
  }))

  return (
    <>
      <PageHeader title="Recepciones" description="Recibí contra la orden: sube stock, genera transferencias y manda la factura a Finanzas."
        breadcrumbs={[{ label: 'Compras' }, { label: 'Recepciones' }]} />
      <div className="space-y-4 p-4 md:p-6">
        <RubroFilter />
        <RecepcionesClient ordenes={ordenes} recepciones={recepciones} />
      </div>
    </>
  )
}
