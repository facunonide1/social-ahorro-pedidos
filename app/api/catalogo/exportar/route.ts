import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { paginaDelCatalogo, type FiltrosCatalogo } from '@/lib/catalogo/pagina'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const TOPE = 20_000

/**
 * EL .XLSX EXPORTA LO QUE COINCIDE, NO LO QUE SE VE.
 *
 * Regla de oro 6: toda pantalla con productos exporta .xlsx con SKU. Con la
 * búsqueda en el servidor, la pantalla muestra 50 filas — pero el que exporta
 * quiere los 46.009 que coinciden con su filtro, no los 50 que tiene delante.
 *
 * Se pagina en el servidor de a 200 y se corta en 20.000, diciéndolo.
 */
export async function GET(req: NextRequest) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no_autorizado' }, { status: 401 })

  const { data: perfil } = await sb
    .from('users_admin').select('activo').eq('id', user.id).maybeSingle()
  if (!perfil?.activo) return NextResponse.json({ error: 'sin_permiso' }, { status: 403 })

  const s = req.nextUrl.searchParams
  const bool = (k: string) => (s.get(k) === '1' ? true : s.get(k) === '0' ? false : null)
  const base: FiltrosCatalogo = {
    q: s.get('q'),
    categoria: s.get('categoria'),
    laboratorio: s.get('laboratorio'),
    condicion: s.get('condicion'),
    conStock: bool('con_stock'),
    conOferta: bool('con_oferta'),
    soloControlados: bool('controlados'),
    orden: (s.get('orden') as any) ?? 'nombre',
    porPagina: 200,
  }

  const filas: any[] = []
  let total = 0
  for (let pagina = 1; filas.length < TOPE; pagina++) {
    const r = await paginaDelCatalogo(sb, { ...base, pagina })
    total = r.total
    filas.push(...r.filas)
    if (r.filas.length < 200 || pagina >= r.paginas) break
  }

  return NextResponse.json({
    total,
    truncado: filas.length < total,
    filas,
  })
}
