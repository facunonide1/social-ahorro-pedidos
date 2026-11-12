import { NextResponse, type NextRequest } from 'next/server'

import { createAdminClient } from '@/lib/supabase/server'
import { exigirCompras } from '@/lib/drive/acceso'
import { armarBusqueda, type ProductoBuscado } from '@/lib/compras/donde-comprar'
import { DIAS_LISTA_VIEJA } from '@/lib/drive/flag'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const g = await exigirCompras()
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
  if (q.length < 2) return NextResponse.json({ error: 'Escribí al menos 2 letras, un EAN o un código.' }, { status: 400 })

  const adm = createAdminClient()
  const like = `%${q.replace(/[%,().]/g, ' ')}%`
  const { data: prods } = await adm.from('productos_catalogo')
    .select('id, nombre, sku, codigo_barras, droga_principal, presentacion')
    .eq('activo', true).eq('es_demo', false)
    .or(`nombre.ilike.${like},sku.ilike.${like},codigo_barras.ilike.${like}`)
    .order('nombre').limit(15)
  const productos: ProductoBuscado[] = ((prods ?? []) as any[]).map((p) => ({
    id: p.id, nombre: p.nombre, sku: p.sku, ean: p.codigo_barras,
    droga: p.droga_principal, presentacion: p.presentacion,
  }))
  const ids = productos.map((p) => p.id)
  const { data: listas } = ids.length
    ? await adm.from('listas_precios').select('id, proveedor_id, fecha_carga, archivo_nombre, vigente, proveedores(razon_social, plazo_pago_dias, forma_pago_default, descuento_pronto_pago_pct)').eq('vigente', true).limit(80)
    : { data: [] }
  const listaIds = ((listas ?? []) as any[]).map((l) => l.id)
  const { data: items } = listaIds.length && ids.length
    ? await adm.from('listas_precios_items').select('lista_id, producto_id, precio, desc_volumen, match_via, match_score, descripcion_origen').in('producto_id', ids).limit(200)
    : { data: [] }

  const listaPorId = new Map(((listas ?? []) as any[]).map((l) => [l.id, l]))
  const ofertas = ((items ?? []) as any[]).map((it) => {
    const lista = listaPorId.get(it.lista_id)
    const prov = lista?.proveedores
    const desc = Number(prov?.descuento_pronto_pago_pct ?? 0)
    const precio = Number(it.precio)
    const vol = it.desc_volumen ?? {}
    return {
      proveedorId: lista?.proveedor_id ?? '',
      proveedor: prov?.razon_social ?? 'Proveedor',
      precio,
      precioFinal: Math.round(precio * (1 - desc / 100) * 100) / 100,
      fechaLista: lista?.fecha_carga ?? null,
      vigente: true,
      condiciones: vol.condiciones ?? null,
      bonificacion: vol.descuento != null ? `${Math.round(Number(vol.descuento) * 100)}%` : (desc ? `${desc}% pronto pago` : null),
      plazo: prov?.plazo_pago_dias ? `${prov.plazo_pago_dias} días` : null,
      formaPago: prov?.forma_pago_default ?? null,
      origen: lista?.archivo_nombre ?? null,
      matchVia: it.match_via ?? null,
      matchScore: it.match_score != null ? Number(it.match_score) : null,
      productoId: it.producto_id as string,
    }
  }).filter((o) => o.proveedorId)

  const productoElegido = productos[0]
  const { data: equiv } = productoElegido?.droga
    ? await adm.from('productos_catalogo').select('id, nombre, sku, codigo_barras, droga_principal, presentacion')
      .eq('activo', true).eq('es_demo', false).ilike('droga_principal', productoElegido.droga).limit(12)
    : { data: [] }

  const r = armarBusqueda({
    q,
    productos,
    ofertas,
    catalogoEquivalentes: ((equiv ?? []) as any[]).map((p) => ({
      id: p.id, nombre: p.nombre, sku: p.sku, ean: p.codigo_barras, droga: p.droga_principal, presentacion: p.presentacion,
    })),
    ahora: new Date(),
  })
  return NextResponse.json({ ...r, diasListaVieja: DIAS_LISTA_VIEJA })
}
