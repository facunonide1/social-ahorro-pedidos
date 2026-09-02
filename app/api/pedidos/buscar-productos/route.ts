import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * BUSCAR EN 46.009 PRODUCTOS SIN TRAERLOS.
 *
 * El filtro, el join con la condición de venta, el stock y la oferta pasan en la
 * base (`pedidos_buscar_productos`). Acá sólo viajan las 25 filas que se
 * muestran. Traer el catálogo al navegador para filtrar es lo que
 * docs/CONSULTAS-QUE-NO-MIENTEN.md prohíbe.
 */
export type ProductoParaPedido = {
  producto_id: string
  sku: string | null
  nombre: string
  laboratorio: string | null
  /** El de SIFACO. `null` = SIFACO no lo declara. No es cero. */
  precio: number | null
  costo: number | null
  /** Total de las cuatro sucursales. `null` = no se pudo leer. */
  stock: number | null
  /** Regla de oro 9. `false` = no se ofrece ni se vende por canal abierto. */
  se_puede_vender: boolean
  condicion: string | null
  por_que: string | null
  oferta_precio: number | null
  oferta_descuento_pct: number | null
  oferta_hasta: string | null
}

export async function GET(req: NextRequest) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no_autorizado' }, { status: 401 })

  const { data: perfil } = await sb
    .from('users_admin').select('rol, activo').eq('id', user.id).maybeSingle()
  if (!perfil?.activo) return NextResponse.json({ error: 'sin_permiso' }, { status: 403 })

  const q = (req.nextUrl.searchParams.get('q') || '').trim()
  if (q.length < 2) return NextResponse.json([])

  const { data, error } = await sb.rpc('pedidos_buscar_productos', { p_q: q, p_limite: 25 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const out: ProductoParaPedido[] = (data ?? []).map((r: any) => ({
    producto_id: r.producto_id,
    sku: r.sku,
    nombre: r.nombre,
    laboratorio: r.laboratorio,
    precio: r.precio === null ? null : Number(r.precio),
    costo: r.costo === null ? null : Number(r.costo),
    stock: r.stock === null ? null : Number(r.stock),
    se_puede_vender: !!r.se_puede_vender,
    condicion: r.condicion,
    por_que: r.por_que,
    oferta_precio: r.oferta_precio === null ? null : Number(r.oferta_precio),
    oferta_descuento_pct: r.oferta_descuento_pct === null ? null : Number(r.oferta_descuento_pct),
    oferta_hasta: r.oferta_hasta,
  }))
  return NextResponse.json(out)
}
