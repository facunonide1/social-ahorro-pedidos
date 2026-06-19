import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'
import { RubroFilter } from '@/components/compras/rubro-filter'
import { parseRubro } from '@/components/compras/rubro'
import { ComparadorClient, type ProductoComp, type ProvLite } from './comparador-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Comparador de precios' }

export default async function ComparadorPage({ searchParams }: { searchParams: { rubro?: string } }) {
  await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'comprador', 'administrativo', 'auditor'] })
  const sb = createClient()
  const rubro = parseRubro(searchParams.rubro)

  // listas vigentes del rubro
  let lq = sb.from('listas_precios').select('id, proveedor_id, rubro').eq('vigente', true).limit(500)
  if (rubro !== 'todos') lq = lq.eq('rubro', rubro)
  const { data: listas } = await lq
  const listaIds = ((listas ?? []) as any[]).map((l) => l.id)
  const provByLista = new Map(((listas ?? []) as any[]).map((l) => [l.id, l.proveedor_id]))

  const [{ data: provs }, { data: items }, { data: hist }] = await Promise.all([
    sb.from('proveedores').select('id, razon_social, plazo_pago_dias, forma_pago_default, descuento_pronto_pago_pct').eq('activo', true),
    listaIds.length ? sb.from('listas_precios_items').select('lista_id, producto_id, precio, desc_volumen, productos_catalogo(nombre, sku)').in('lista_id', listaIds).not('producto_id', 'is', null).limit(20000) : Promise.resolve({ data: [] as any[] }),
    sb.from('precios_historico').select('producto_id, proveedor_id, precio, fecha').order('fecha', { ascending: false }).limit(20000),
  ])

  const provMap = new Map(((provs ?? []) as any[]).map((p) => [p.id, p]))
  const provList: ProvLite[] = ((provs ?? []) as any[]).map((p) => ({ id: p.id, nombre: p.razon_social, plazo: p.plazo_pago_dias, forma: p.forma_pago_default }))

  // precio anterior por (producto, proveedor) para evolución
  const prevPrecio = new Map<string, number>()
  const seen = new Set<string>()
  for (const h of (hist ?? []) as any[]) {
    const k = `${h.producto_id}|${h.proveedor_id}`
    if (seen.has(k)) { if (!prevPrecio.has(k)) prevPrecio.set(k, Number(h.precio)) }
    else seen.add(k)
  }

  const map = new Map<string, ProductoComp>()
  for (const it of (items ?? []) as any[]) {
    const provId = provByLista.get(it.lista_id); if (!provId) continue
    const prov = provMap.get(provId)
    const g = map.get(it.producto_id) ?? { producto_id: it.producto_id, nombre: it.productos_catalogo?.nombre ?? '—', sku: it.productos_catalogo?.sku ?? null, ofertas: [] }
    const precio = Number(it.precio)
    const descPP = Number(prov?.descuento_pronto_pago_pct ?? 0)
    const precioFinal = Math.round(precio * (1 - descPP / 100) * 100) / 100
    const prev = prevPrecio.get(`${it.producto_id}|${provId}`)
    g.ofertas.push({
      proveedor_id: provId, proveedor: prov?.razon_social ?? '—', precio, precioFinal,
      condicion: prov?.plazo_pago_dias ? `${prov.plazo_pago_dias} días` : (prov?.forma_pago_default ?? '—'),
      descPP, subio: prev != null && precio > prev,
    })
    map.set(it.producto_id, g)
  }
  const productos = [...map.values()].map((p) => {
    p.ofertas.sort((a, b) => a.precioFinal - b.precioFinal)
    return p
  }).sort((a, b) => a.nombre.localeCompare(b.nombre))

  return (
    <>
      <PageHeader title="Comparador de precios" description="Mejor precio por producto dentro del rubro + smart split entre proveedores."
        breadcrumbs={[{ label: 'Compras' }, { label: 'Comparador' }]} />
      <div className="space-y-4 p-4 md:p-6">
        <RubroFilter />
        <ComparadorClient productos={productos} proveedores={provList} rubro={rubro} />
      </div>
    </>
  )
}
