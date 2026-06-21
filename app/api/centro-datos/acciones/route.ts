import { NextResponse, type NextRequest } from 'next/server'

import { createAdminClient } from '@/lib/supabase/server'
import { gateCentroDatos } from '@/lib/centro-datos/gate'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** GET: lista acciones de exportación (sistema + custom). */
export async function GET() {
  const g = await gateCentroDatos()
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  const adm = createAdminClient()
  const { data, error } = await adm.from('acciones_export').select('*').eq('activa', true)
    .order('es_sistema', { ascending: false }).order('nombre')
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ acciones: data ?? [] })
}

/** POST: crea o actualiza una acción (constructor). */
export async function POST(req: NextRequest) {
  const g = await gateCentroDatos()
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'body inválido' }, { status: 400 }) }
  const adm = createAdminClient()

  if (!b?.nombre) return NextResponse.json({ error: 'nombre requerido' }, { status: 400 })
  const payload: Record<string, unknown> = {
    nombre: b.nombre, descripcion: b.descripcion ?? null,
    query_definicion: b.query_definicion ?? {}, perfil_formato_id: b.perfil_formato_id ?? null,
    icono: b.icono ?? 'Download', frecuencia: b.frecuencia ?? 'manual',
  }
  if (b?.id) {
    const { error } = await adm.from('acciones_export').update(payload).eq('id', b.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, id: b.id })
  }
  const { data, error } = await adm.from('acciones_export').insert({ ...payload, created_by: g.userId }).select('id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, id: data.id })
}

/** DELETE: baja lógica (no toca acciones de sistema). */
export async function DELETE(req: NextRequest) {
  const g = await gateCentroDatos()
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
  const adm = createAdminClient()
  const { data: a } = await adm.from('acciones_export').select('es_sistema').eq('id', id).maybeSingle<{ es_sistema: boolean }>()
  if (a?.es_sistema) return NextResponse.json({ error: 'No se puede eliminar una acción de sistema' }, { status: 400 })
  const { error } = await adm.from('acciones_export').update({ activa: false }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
