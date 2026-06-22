import { NextResponse, type NextRequest } from 'next/server'

import { createAdminClient } from '@/lib/supabase/server'
import { gateCrm } from '@/lib/crm/gate'
import { redactarCampania } from '@/lib/crm/nora-redactar'
import { enviarCampania } from '@/lib/crm/canales'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * POST:
 *  - { accion:'redactar', objetivo, canales, segmento_id?, variante? } → { mensaje, via }
 *  - { accion:'guardar', id?, nombre, segmento_id, objetivo, canales, mensaje, cupon_ref?, redactado_por? } → { id }
 *  - { accion:'enviar', id }      → ejecuta el envío (push/email/whatsapp)
 *  - { accion:'programar', id, programada_at }
 *  - { accion:'eliminar', id }
 */
export async function POST(req: NextRequest) {
  const g = await gateCrm('crear')
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'body inválido' }, { status: 400 }) }
  const adm = createAdminClient()

  if (b?.accion === 'redactar') {
    let segNombre: string | undefined
    if (b?.segmento_id) { const { data } = await adm.from('segmentos').select('nombre').eq('id', b.segmento_id).maybeSingle(); segNombre = data?.nombre }
    const r = await redactarCampania({ objetivo: b?.objetivo ?? 'promo', canales: b?.canales ?? ['push'], segmentoNombre: segNombre, variante: b?.variante ?? 'normal' })
    return NextResponse.json(r)
  }

  if (b?.accion === 'guardar') {
    if (!b?.nombre) return NextResponse.json({ error: 'nombre requerido' }, { status: 400 })
    const payload = {
      nombre: b.nombre, segmento_id: b.segmento_id ?? null, objetivo: b.objetivo ?? null,
      canales: b.canales ?? [], mensaje: b.mensaje ?? {}, cupon_ref: b.cupon_ref ?? null,
      redactado_por: b.redactado_por ?? 'usuario',
    }
    if (b?.id) { await adm.from('campanias_crm').update(payload).eq('id', b.id); return NextResponse.json({ ok: true, id: b.id }) }
    const { data, error } = await adm.from('campanias_crm').insert({ ...payload, created_by: g.userId }).select('id').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, id: data.id })
  }

  if (b?.accion === 'programar') {
    if (!b?.id || !b?.programada_at) return NextResponse.json({ error: 'id y fecha requeridos' }, { status: 400 })
    await adm.from('campanias_crm').update({ estado: 'programada', programada_at: b.programada_at }).eq('id', b.id)
    return NextResponse.json({ ok: true })
  }

  if (b?.accion === 'enviar') {
    if (!b?.id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
    try { const r = await enviarCampania(adm, b.id); return NextResponse.json({ ok: true, ...r }) }
    catch (e: any) { return NextResponse.json({ error: e?.message ?? 'Error al enviar' }, { status: 400 }) }
  }

  if (b?.accion === 'eliminar') {
    if (!b?.id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
    await adm.from('campanias_crm').delete().eq('id', b.id)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'acción inválida' }, { status: 400 })
}
