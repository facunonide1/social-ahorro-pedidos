import { NextResponse, type NextRequest } from 'next/server'
import { randomUUID } from 'crypto'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { proponerUna, DESCRIPCIONES_MODEL, type EnCola } from '@/lib/descripciones/generar'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * F.1 · GENERAR UN LOTE DE DESCRIPCIONES.
 *
 * ── POR QUÉ UN LOTE Y NO LAS 7.600 ──────────────────────────────────────────
 *
 * Porque alguien las tiene que leer. Generar 7.600 de una es generar 7.600 que
 * nadie va a confirmar, y sin confirmar no se publica ninguna: el resultado
 * sería el mismo que ahora, con el gasto hecho.
 *
 * El lote entra como `propuesta`. Nada sale al canal hasta que se confirme.
 */
const TOPE_LOTE = 25

export async function POST(req: NextRequest) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'sin sesión' }, { status: 401 })

  const { data: perfil } = await sb.from('users_admin')
    .select('rol, activo').eq('id', user.id)
    .maybeSingle<{ rol: string; activo: boolean }>()
  if (!perfil?.activo || !['super_admin', 'gerente', 'comprador', 'marketing'].includes(perfil.rol)) {
    return NextResponse.json({ error: 'sin permiso' }, { status: 403 })
  }

  let cuantas = TOPE_LOTE
  try {
    const body = await req.json()
    cuantas = Math.min(Math.max(Number(body?.cuantas) || TOPE_LOTE, 1), TOPE_LOTE)
  } catch { /* el default */ }

  const adm = createAdminClient()
  const { data: cola, error: eCola } = await adm.rpc('descripciones_cola', { p_limite: cuantas })
  if (eCola) return NextResponse.json({ error: eCola.message }, { status: 500 })

  const pendientes = ((cola ?? []) as (EnCola & { estado: string })[])
    .filter((p) => p.estado === 'sin_describir')
  if (!pendientes.length) {
    return NextResponse.json({ ok: true, lote: null, generadas: 0, que_paso: 'no queda ninguna sin describir en la cola' })
  }

  const lote = randomUUID()
  let conTexto = 0
  let sinPoder = 0
  const errores: { producto_id: string; error: string }[] = []

  for (const p of pendientes) {
    try {
      const prop = await proponerUna(adm, p)
      // Una descripción que el modelo no pudo escribir se guarda igual, con el
      // motivo. F.4: lo que no se puede describir queda sin describir y lo
      // dice — si no se guardara, mañana volvería a la cola y se gastaría otra
      // vez en el mismo producto.
      const { error } = await adm.from('producto_descripciones').upsert({
        producto_id: prop.producto_id,
        texto: prop.texto,
        estado: prop.texto ? 'propuesta' : 'no_se_puede',
        por_que_no: prop.por_que_no,
        fuente: prop.fuente,
        modelo: DESCRIPCIONES_MODEL,
        lote_id: lote,
        generada_at: new Date().toISOString(),
      }, { onConflict: 'producto_id' })
      if (error) throw new Error(error.message)
      prop.texto ? conTexto++ : sinPoder++
    } catch (e: any) {
      errores.push({ producto_id: p.producto_id, error: e?.message ?? 'falló' })
    }
  }

  return NextResponse.json({
    ok: true, lote, generadas: conTexto, sin_poder: sinPoder,
    errores: errores.length ? errores : undefined,
    que_paso: `${conTexto} quedaron como propuesta y ${sinPoder} como «no se puede describir», con el motivo. ` +
      'Nada sale al canal hasta que se confirme el lote.',
  })
}
