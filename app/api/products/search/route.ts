import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { searchWooProducts } from '@/lib/woo/client'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export type ProductSuggestion = {
  id: number
  name: string
  sku: string | null
  price: number
  stock: 'instock' | 'outofstock' | 'onbackorder' | null
  image: string | null
}

export async function GET(req: NextRequest) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no_autorizado' }, { status: 401 })

  const { data: profile } = await sb
    .from('users_pedidos').select('role, active').eq('id', user.id).maybeSingle()

  if (!profile?.active || !['admin', 'operador'].includes(profile.role)) {
    return NextResponse.json({ error: 'sin_permiso' }, { status: 403 })
  }

  const q = (req.nextUrl.searchParams.get('q') || '').trim()
  if (q.length < 2) return NextResponse.json([])

  const products = await searchWooProducts(q, 12)
  const out: ProductSuggestion[] = products.map(p => ({
    id: p.id,
    name: p.name,
    sku: p.sku || null,
    price: Number(p.price) || Number(p.regular_price) || 0,
    stock: p.stock_status ?? null,
    image: p.images?.[0]?.src ?? null,
  }))

  return NextResponse.json(out)
}
