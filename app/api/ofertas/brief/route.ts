import { NextResponse, type NextRequest } from 'next/server'

import { createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Estado del brief por TOKEN (sin login — el token es el secreto). abierto lo
 * marca el primer acceso (desde la página); publicado lo marca cualquiera con
 * el link (botón simple) o un admin.
 */
export async function POST(req: NextRequest) {
  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'body inválido' }, { status: 400 }) }
  const token = String(b?.token ?? '').trim()
  const accion = b?.accion
  if (!token || !['abierto', 'publicado'].includes(accion)) return NextResponse.json({ error: 'parámetros inválidos' }, { status: 400 })

  const adm = createAdminClient()
  const { data: br } = await adm.from('ofertas_briefs').select('id, estado').eq('token', token).maybeSingle()
  if (!br) return NextResponse.json({ error: 'brief inexistente' }, { status: 404 })

  if (accion === 'abierto') {
    if (br.estado === 'generado') await adm.from('ofertas_briefs').update({ estado: 'abierto', abierto_at: new Date().toISOString() }).eq('id', br.id)
    return NextResponse.json({ ok: true })
  }
  // publicado
  await adm.from('ofertas_briefs').update({ estado: 'publicado', publicado_at: new Date().toISOString() }).eq('id', br.id)
  return NextResponse.json({ ok: true })
}
