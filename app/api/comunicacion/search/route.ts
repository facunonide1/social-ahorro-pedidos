import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { listAdminUsersLite } from '@/lib/supabase/admin-users'
import type { AdminRole } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export type MsgHit = {
  id: string
  canal_id: string
  canal: string
  autor: string
  fecha: string
  fragmento: string
}

/**
 * Búsqueda full-text en mensajes (OS-2b · A).
 * CRÍTICO: solo devuelve mensajes de canales donde el solicitante ES MIEMBRO
 * (canal_miembros) o que son públicos (es_privado=false). La verificación es
 * SIEMPRE server-side; el cliente no puede ampliar el alcance.
 *
 * Query params: q (req), canal, autor, desde (ISO), hasta (ISO).
 */
export async function GET(req: NextRequest) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no autenticado' }, { status: 401 })
  const { data: me } = await sb.from('users_admin').select('activo').eq('id', user.id).maybeSingle<{ activo: boolean }>()
  if (!me?.activo) return NextResponse.json({ error: 'sin permiso' }, { status: 403 })

  const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
  if (q.length < 2) return NextResponse.json({ hits: [] })

  const canalFiltro = req.nextUrl.searchParams.get('canal')
  const autorFiltro = req.nextUrl.searchParams.get('autor')
  const desde = req.nextUrl.searchParams.get('desde')
  const hasta = req.nextUrl.searchParams.get('hasta')

  const adm = createAdminClient()
  const permitidos = await canalesPermitidos(adm, user.id)
  if (permitidos.length === 0) return NextResponse.json({ hits: [] })

  // Si piden un canal específico, debe estar dentro de los permitidos.
  let canalIds = permitidos
  if (canalFiltro) {
    if (!permitidos.includes(canalFiltro)) return NextResponse.json({ hits: [] })
    canalIds = [canalFiltro]
  }

  let query = adm
    .from('mensajes')
    .select('id, canal_id, autor_user_id, contenido, created_at, canales(nombre)')
    .in('canal_id', canalIds)
    .textSearch('contenido', q, { type: 'websearch', config: 'spanish' })
    .order('created_at', { ascending: false })
    .limit(40)
  if (autorFiltro) query = query.eq('autor_user_id', autorFiltro)
  if (desde) query = query.gte('created_at', desde)
  if (hasta) query = query.lte('created_at', hasta)

  const { data: rows, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const autores = [...new Set(((rows ?? []) as any[]).map((r) => r.autor_user_id).filter(Boolean))]
  const users = autores.length ? await listAdminUsersLite(adm, { soloActivos: false }) : []
  const nombre = new Map(((users ?? []) as any[]).map((u) => [u.id, u.nombre || u.email]))

  const hits: MsgHit[] = ((rows ?? []) as any[]).map((r) => ({
    id: r.id,
    canal_id: r.canal_id,
    canal: r.canales?.nombre ?? '—',
    autor: r.autor_user_id ? (nombre.get(r.autor_user_id) ?? 'Usuario') : 'NORA',
    fecha: r.created_at,
    fragmento: fragmento(r.contenido ?? '', q),
  }))

  return NextResponse.json({ hits })
}

/** Canales que el usuario puede leer: donde es miembro + los públicos. */
export async function canalesPermitidos(adm: any, userId: string): Promise<string[]> {
  const [{ data: miembro }, { data: publicos }] = await Promise.all([
    adm.from('canal_miembros').select('canal_id').eq('user_id', userId),
    adm.from('canales').select('id').eq('es_privado', false),
  ])
  const set = new Set<string>()
  for (const m of (miembro ?? []) as any[]) set.add(m.canal_id)
  for (const c of (publicos ?? []) as any[]) set.add(c.id)
  return [...set]
}

/** Fragmento de ~160 chars alrededor de la primera coincidencia. */
function fragmento(texto: string, q: string): string {
  if (texto.length <= 160) return texto
  const term = q.split(/\s+/)[0]?.toLowerCase() ?? ''
  const i = texto.toLowerCase().indexOf(term)
  if (i < 0) return texto.slice(0, 160) + '…'
  const start = Math.max(0, i - 60)
  return (start > 0 ? '…' : '') + texto.slice(start, start + 160) + (start + 160 < texto.length ? '…' : '')
}
