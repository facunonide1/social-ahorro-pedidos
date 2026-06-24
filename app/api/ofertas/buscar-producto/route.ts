import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { AdminRole } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export type ProductoBusqueda = {
  id: string
  nombre: string
  sku: string | null
  codigo_barras: string | null
  precio_sugerido: number | null
}

/**
 * Autocomplete de productos del catálogo para armar ofertas. Busca por
 * SKU (CODIGO) / nombre / EAN (BARRAS) indistintamente. GET ?q=...
 */
export async function GET(req: NextRequest) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no autenticado' }, { status: 401 })
  const { data: me } = await sb.from('users_admin').select('rol, activo').eq('id', user.id).maybeSingle<{ rol: AdminRole; activo: boolean }>()
  if (!me?.activo) return NextResponse.json({ error: 'sin permiso' }, { status: 403 })

  const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
  if (q.length < 2) return NextResponse.json([])

  const adm = createAdminClient()
  // escapamos comas para no romper el .or()
  const like = `%${q.replace(/[%,]/g, ' ')}%`
  const { data, error } = await adm.from('productos_catalogo')
    .select('id, nombre, sku, codigo_barras, precio_sugerido')
    .eq('activo', true)
    .or(`sku.ilike.${like},nombre.ilike.${like},codigo_barras.ilike.${like}`)
    .order('nombre')
    .limit(12)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json((data ?? []) as ProductoBusqueda[])
}
