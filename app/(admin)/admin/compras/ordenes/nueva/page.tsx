import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'
import { NuevaOrdenForm, type ProvLite, type SucLite, type ProdLite, type ItemInicial } from './form'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Nueva orden de compra' }

export default async function NuevaOrdenPage({ searchParams }: { searchParams: { avisos?: string } }) {
  await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'comprador'] })
  const sb = createClient()

  const [{ data: provs }, { data: sucs }, { data: prods }] = await Promise.all([
    sb.from('proveedores').select('id, razon_social, rubros, plazo_pago_dias, forma_pago_default').eq('activo', true).order('razon_social').limit(500),
    sb.from('sucursales').select('id, nombre, codigo').eq('activa', true).order('nombre'),
    sb.from('productos_catalogo').select('id, sku, nombre, precio_costo_promedio').eq('activo', true).order('nombre').limit(5000),
  ])

  // Precarga desde avisos de faltante (?avisos=id1,id2)
  let iniciales: ItemInicial[] = []
  const avisoIds = (searchParams.avisos ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  if (avisoIds.length) {
    const { data: avisos } = await sb.from('avisos_faltante')
      .select('id, producto_id, texto_libre, cantidad_sugerida, sucursal_id, productos_catalogo(nombre, sku, precio_costo_promedio)')
      .in('id', avisoIds)
    const map = new Map<string, ItemInicial>()
    for (const a of (avisos ?? []) as any[]) {
      if (!a.producto_id) continue
      const ex = map.get(a.producto_id)
      const qty = a.cantidad_sugerida != null ? Number(a.cantidad_sugerida) : 0
      if (ex) {
        ex.distribucion[a.sucursal_id] = (ex.distribucion[a.sucursal_id] ?? 0) + qty
        ex.avisoIds.push(a.id)
      } else {
        map.set(a.producto_id, {
          producto_id: a.producto_id, nombre: a.productos_catalogo?.nombre ?? '—', sku: a.productos_catalogo?.sku ?? null,
          costo: Number(a.productos_catalogo?.precio_costo_promedio ?? 0),
          distribucion: { [a.sucursal_id]: qty }, avisoIds: [a.id],
        })
      }
    }
    iniciales = [...map.values()]
  }

  return (
    <>
      <PageHeader title="Nueva orden de compra" description="Elegí proveedor, sucursal compradora y distribuí por sucursal."
        breadcrumbs={[{ label: 'Compras' }, { label: 'Órdenes', href: '/admin/compras/ordenes' }, { label: 'Nueva' }]} />
      <div className="p-4 md:p-6">
        <NuevaOrdenForm
          proveedores={((provs ?? []) as any[]).map((p) => ({ id: p.id, nombre: p.razon_social, rubros: p.rubros ?? [], plazo: p.plazo_pago_dias, forma: p.forma_pago_default })) as ProvLite[]}
          sucursales={((sucs ?? []) as any[]).map((s) => ({ id: s.id, nombre: s.nombre, codigo: s.codigo })) as SucLite[]}
          productos={((prods ?? []) as any[]).map((p) => ({ id: p.id, sku: p.sku, nombre: p.nombre, costo: Number(p.precio_costo_promedio ?? 0) })) as ProdLite[]}
          iniciales={iniciales}
        />
      </div>
    </>
  )
}
