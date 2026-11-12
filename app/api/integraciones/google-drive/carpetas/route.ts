import { NextResponse, type NextRequest } from 'next/server'

import { createAdminClient } from '@/lib/supabase/server'
import { exigirDueno } from '@/lib/drive/acceso'
import { ingestaHabilitada } from '@/lib/drive/flag'
import { claveDesdeEnv, descifrarToken } from '@/lib/drive/crypto'
import { buscarCarpetas, refrescarAccessToken } from '@/lib/drive/google'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

async function tokenDe(userId: string) {
  const adm = createAdminClient()
  const { data: row } = await adm.from('integraciones_google_drive')
    .select('id, refresh_token_cifrado, iv, tag, estado').eq('owner_admin_id', userId).limit(1).maybeSingle()
  if (!row) return { error: 'No hay una cuenta conectada.', status: 400 as const }
  if (row.estado === 'vencida') return { error: 'La conexión venció. Reconectá.', status: 409 as const }
  const refresh = descifrarToken({ cifrado: row.refresh_token_cifrado, iv: row.iv, tag: row.tag }, claveDesdeEnv())
  const acceso = await refrescarAccessToken(refresh)
  if (!acceso.ok) return { error: acceso.error, status: acceso.invalidGrant ? 409 as const : 502 as const }
  return { adm, id: row.id as string, token: acceso.accessToken }
}

export async function GET(req: NextRequest) {
  const g = await exigirDueno()
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  if (!ingestaHabilitada()) return NextResponse.json({ error: 'deshabilitado' }, { status: 403 })
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
  if (q.length < 2) return NextResponse.json({ carpetas: [] })
  const t = await tokenDe(g.userId)
  if ('error' in t) return NextResponse.json({ error: t.error }, { status: t.status })
  const carpetas = await buscarCarpetas(t.token, q)
  return NextResponse.json({
    carpetas: carpetas.map((c) => ({ id: c.id, nombre: c.name })),
  })
}

export async function POST(req: NextRequest) {
  const g = await exigirDueno()
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  const body = await req.json().catch(() => null)
  const lista = Array.isArray(body?.carpetas) ? body.carpetas : null
  if (!lista) return NextResponse.json({ error: 'faltan las carpetas' }, { status: 400 })
  const adm = createAdminClient()
  const { data: row } = await adm.from('integraciones_google_drive').select('id').eq('owner_admin_id', g.userId).limit(1).maybeSingle()
  if (!row) return NextResponse.json({ error: 'Conectá Drive antes de elegir carpetas.' }, { status: 400 })
  const limpias = lista
    .filter((c: any) => c && typeof c.folderId === 'string' && typeof c.nombre === 'string')
    .slice(0, 20)
    .map((c: any) => ({
      integracion_id: row.id,
      folder_id: c.folderId,
      folder_nombre: c.nombre,
      incluir_subcarpetas: c.incluirSubcarpetas !== false,
    }))
  await adm.from('integraciones_google_drive_carpetas').delete().eq('integracion_id', row.id)
  if (limpias.length) {
    const { error } = await adm.from('integraciones_google_drive_carpetas').insert(limpias)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  await adm.from('integraciones_google_drive').update({
    listado_cursor: null, listado_completo: false, last_sync_at: null,
  }).eq('id', row.id)
  return NextResponse.json({ ok: true, guardadas: limpias.length })
}
