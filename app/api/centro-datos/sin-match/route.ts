import { NextResponse, type NextRequest } from 'next/server'

import { createAdminClient } from '@/lib/supabase/server'
import { gateCentroDatos } from '@/lib/centro-datos/gate'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** GET ?q=texto: busca productos del catálogo para vincular (sku o nombre). */
export async function GET(req: NextRequest) {
  const g = await gateCentroDatos()
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
  if (q.length < 2) return NextResponse.json({ productos: [] })
  const adm = createAdminClient()
  const { data } = await adm.from('productos_catalogo')
    .select('id, sku, nombre, codigo_barras').eq('activo', true)
    .or(`sku.ilike.%${q}%,nombre.ilike.%${q}%,codigo_barras.ilike.%${q}%`).limit(15)
  return NextResponse.json({ productos: data ?? [] })
}

/**
 * POST: resuelve un item de la cola sin matchear.
 *  - { accion: 'ignorar', id }
 *  - { accion: 'vincular', id, producto_id }  → vincula a un producto existente
 *  - { accion: 'crear', id }                  → crea el producto desde el item
 * Al vincular/crear, hace backfill de ventas_diarias.producto_id por SKU.
 */
export async function POST(req: NextRequest) {
  const g = await gateCentroDatos()
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'body inválido' }, { status: 400 }) }
  const adm = createAdminClient()
  const { accion, id } = b ?? {}
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const { data: item } = await adm.from('items_sin_match').select('*').eq('id', id).maybeSingle()
  if (!item) return NextResponse.json({ error: 'item no encontrado' }, { status: 404 })
  const now = new Date().toISOString()

  if (accion === 'ignorar') {
    await adm.from('items_sin_match').update({ estado: 'ignorado', resuelto_at: now }).eq('id', id)
    return NextResponse.json({ ok: true })
  }

  let productoId: string | null = null

  if (accion === 'vincular') {
    if (!b?.producto_id) return NextResponse.json({ error: 'producto_id requerido' }, { status: 400 })
    productoId = b.producto_id
    await adm.from('items_sin_match').update({ estado: 'vinculado', resuelto_producto_id: productoId, resuelto_at: now }).eq('id', id)
  } else if (accion === 'crear') {
    const sku = item.sku ?? item.codigo
    if (!sku) return NextResponse.json({ error: 'el item no tiene CODIGO para crear el producto' }, { status: 400 })
    // no duplicar por sku
    const { data: ya } = await adm.from('productos_catalogo').select('id').eq('sku', sku).maybeSingle()
    if (ya) productoId = ya.id
    else {
      const { data: nuevo, error } = await adm.from('productos_catalogo').insert({
        sku, codigo_barras: item.barras ?? null,
        nombre: item.descripcion_origen ?? sku, activo: true, created_by: g.userId,
      }).select('id').single()
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      productoId = nuevo.id
    }
    await adm.from('items_sin_match').update({ estado: 'creado', resuelto_producto_id: productoId, resuelto_at: now }).eq('id', id)
  } else {
    return NextResponse.json({ error: 'acción inválida' }, { status: 400 })
  }

  // backfill: las ventas_diarias de ese SKU sin producto → vincular
  const sku = item.sku ?? item.codigo
  if (productoId && sku) {
    await adm.from('ventas_diarias').update({ producto_id: productoId }).eq('sku', sku).is('producto_id', null)
  }

  return NextResponse.json({ ok: true, producto_id: productoId })
}
