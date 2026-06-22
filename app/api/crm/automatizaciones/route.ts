import { NextResponse, type NextRequest } from 'next/server'

import { createAdminClient } from '@/lib/supabase/server'
import { gateCrm } from '@/lib/crm/gate'
import { redactarPlantilla } from '@/lib/crm/nora-redactar'
import { correrAutomatizaciones } from '@/lib/crm/automatizaciones'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const TRIGGER_OBJETIVO: Record<string, string> = {
  cumpleanos: 'cumpleanos', inactividad_30d: 'reactivar', recompra_cronico: 'recompra', nivel_alcanzado: 'fidelizar',
}

export async function POST(req: NextRequest) {
  const g = await gateCrm('crear')
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'body inválido' }, { status: 400 }) }
  const adm = createAdminClient()

  if (b?.accion === 'toggle') {
    if (!b?.id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
    await adm.from('automatizaciones').update({ activa: !!b.activa }).eq('id', b.id)
    return NextResponse.json({ ok: true })
  }
  if (b?.accion === 'eliminar') {
    if (!b?.id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
    await adm.from('automatizaciones').delete().eq('id', b.id)
    return NextResponse.json({ ok: true })
  }
  if (b?.accion === 'correr') {
    const r = await correrAutomatizaciones(adm)
    return NextResponse.json({ ok: true, resultado: r })
  }
  if (b?.accion === 'guardar') {
    if (!b?.nombre || !b?.trigger) return NextResponse.json({ error: 'nombre y trigger requeridos' }, { status: 400 })
    const canales = b.canales ?? ['push']
    // auto-redacta el template con NORA (plantilla) si no vino uno
    let tpl = b.mensaje_template
    if (!tpl || !Object.keys(tpl).length) {
      const m = redactarPlantilla(TRIGGER_OBJETIVO[b.trigger] ?? 'promo', canales)
      tpl = m.email ?? (m.push ? { subject: m.push.title, body: m.push.body } : {})
      if (m.push) tpl = { ...tpl, title: m.push.title, body: tpl.body ?? m.push.body }
    }
    const payload = { nombre: b.nombre, trigger: b.trigger, config: b.config ?? {}, canales, mensaje_template: tpl, cupon_ref: b.cupon_ref ?? null, activa: b.activa ?? true }
    if (b?.id) { await adm.from('automatizaciones').update(payload).eq('id', b.id); return NextResponse.json({ ok: true, id: b.id }) }
    const { data, error } = await adm.from('automatizaciones').insert({ ...payload, created_by: g.userId }).select('id').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, id: data.id })
  }
  return NextResponse.json({ error: 'acción inválida' }, { status: 400 })
}
