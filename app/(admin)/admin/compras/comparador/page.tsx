import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'
import { RubroFilter } from '@/components/compras/rubro-filter'
import { parseRubro } from '@/components/compras/rubro'
import { partirPorFecha, type EventoPrecio } from '@/lib/compras/vigencia-precios'
import { paginar } from '@/lib/supabase/paginar'
import { ComparadorClient, type ProductoComp, type ProvLite } from './comparador-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Comparador de precios' }

export default async function ComparadorPage({ searchParams }: { searchParams: { rubro?: string } }) {
  await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'comprador', 'administrativo', 'auditor'] })
  const sb = createClient()
  const rubro = parseRubro(searchParams.rubro)

  // listas vigentes del rubro
  let lq = sb.from('listas_precios').select('id, proveedor_id, rubro, vigente_desde, fecha_carga').eq('vigente', true).limit(500)
  if (rubro !== 'todos') lq = lq.eq('rubro', rubro)
  const { data: listas } = await lq
  const listaIds = ((listas ?? []) as any[]).map((l) => l.id)
  const provByLista = new Map(((listas ?? []) as any[]).map((l) => [l.id, l.proveedor_id]))

  const [{ data: provs }, { data: items }] = await Promise.all([
    sb.from('proveedores').select('id, razon_social, plazo_pago_dias, forma_pago_default, descuento_pronto_pago_pct').eq('activo', true),
    listaIds.length ? sb.from('listas_precios_items').select('lista_id, producto_id, precio, desc_volumen, productos_catalogo(nombre, sku)').in('lista_id', listaIds).not('producto_id', 'is', null).limit(20000) : Promise.resolve({ data: [] as any[] }),
  ])

  // Historial sólo de los productos que se muestran, en tandas de 100 ids y
  // paginado: un tope global dejaba sin historial a casi todos.
  const productoIds = Array.from(new Set(((items ?? []) as any[]).map((it) => it.producto_id as string)))
  const hist: any[] = []
  for (let i = 0; i < productoIds.length; i += 100) {
    const { filas } = await paginar<any>(sb.from('doc_precios_historial')
      .select('item_id, tercero_id, precio_unitario, precio_neto, fecha, origen')
      .in('item_id', productoIds.slice(i, i + 100))
      .order('fecha', { ascending: false }).order('id'), { maximo: 20_000 })
    hist.push(...filas)
  }

  const provMap = new Map(((provs ?? []) as any[]).map((p) => [p.id, p]))
  const provList: ProvLite[] = ((provs ?? []) as any[]).map((p) => ({ id: p.id, nombre: p.razon_social, plazo: p.plazo_pago_dias, forma: p.forma_pago_default }))

  const fechaLista = new Map(((listas ?? []) as any[]).map((l) => [
    l.id, String(l.vigente_desde ?? l.fecha_carga ?? '').slice(0, 10) || null,
  ]))
  const eventos = new Map<string, EventoPrecio[]>()
  for (const h of hist) {
    if (!h.item_id || !h.tercero_id) continue
    const origen = h.origen === 'factura' || h.origen === 'remito' ? 'factura' as const : 'lista' as const
    const precio = Number(h.precio_neto ?? h.precio_unitario)
    if (!(precio > 0)) continue
    const k = `${h.item_id}|${h.tercero_id}`
    const arr = eventos.get(k) ?? []
    arr.push({ productoId: h.item_id, proveedorId: h.tercero_id, origen, fecha: String(h.fecha).slice(0, 10), precio })
    eventos.set(k, arr)
  }

  const map = new Map<string, ProductoComp>()
  for (const it of (items ?? []) as any[]) {
    const provId = provByLista.get(it.lista_id); if (!provId) continue
    const prov = provMap.get(provId)
    const g: ProductoComp = map.get(it.producto_id) ?? { producto_id: it.producto_id, nombre: it.productos_catalogo?.nombre ?? '—', sku: it.productos_catalogo?.sku ?? null, ofertas: [] }
    const precio = Number(it.precio)
    const descPP = Number(prov?.descuento_pronto_pago_pct ?? 0)
    const precioFinal = Math.round(precio * (1 - descPP / 100) * 100) / 100
    const vista = partirPorFecha(eventos.get(`${it.producto_id}|${provId}`) ?? [])
    const prev = vista.anteriores.find((e) => e.origen === 'lista')
    g.ofertas.push({
      proveedor_id: provId, proveedor: prov?.razon_social ?? '—', precio, precioFinal,
      condicion: prov?.plazo_pago_dias ? `${prov.plazo_pago_dias} días` : (prov?.forma_pago_default ?? '—'),
      descPP, subio: prev != null && precio > prev.precio,
      fechaLista: fechaLista.get(it.lista_id) ?? null,
      precioPagado: vista.factura?.precio ?? null,
      fechaPagado: vista.factura?.fecha ?? null,
      anteriores: vista.anteriores,
    })
    map.set(it.producto_id, g)
  }
  const productos = [...map.values()].map((p) => {
    p.ofertas.sort((a, b) => a.precioFinal - b.precioFinal)
    return p
  }).sort((a, b) => a.nombre.localeCompare(b.nombre))

  return (
    <>
      <PageHeader
        title="Comparador de listas"
        description="El último precio de lista y el último precio pagado, cada uno con su fecha. Lo anterior queda en el historial."
        breadcrumbs={[{ label: 'Compras' }, { label: 'Comparador de listas' }]}
      />
      <div className="space-y-4 p-4 md:p-6">
        <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          <span>Lista y último precio pagado, por droguería. Una lista más vieja no pisa la vigente.</span>
          <a href="/admin/compras/costos" className="text-primary hover:underline">
            Ver el comparador de costos reales (lo facturado) →
          </a>
        </div>
        <RubroFilter />
        <ComparadorClient productos={productos} proveedores={provList} rubro={rubro} />
      </div>
    </>
  )
}
