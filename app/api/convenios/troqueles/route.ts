import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { puede, type PermisosCustom } from '@/lib/types/permisos'
import type { AdminRole } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * B.4 · LOS TROQUELES.
 *
 * ── POR QUÉ ESTO ES LO MÁS IMPORTANTE DEL BLOQUE B ──────────────────────────
 *
 * Porque es lo que después define si un débito es reclamable. Un débito por
 * «troquel faltante» contra una presentación con remito y acuse de recibo se
 * reclama con una foto; contra una presentación sin acuse, no hay con qué
 * discutir y el débito es plata perdida.
 *
 * El acuse se carga semanas antes de que llegue el débito. Cuando el débito
 * llega, el acuse ya está o ya no está — no hay forma de conseguirlo después.
 * De ahí que la pantalla insista.
 */

async function gate(accion: 'crear' | 'editar') {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: 'no autenticado', status: 401 as const }

  const { data: me } = await sb.from('users_admin')
    .select('rol, activo, permisos_custom, sucursal_id').eq('id', user.id)
    .maybeSingle<{ rol: AdminRole; activo: boolean; permisos_custom: PermisosCustom | null; sucursal_id: string | null }>()
  if (!me?.activo) return { error: 'usuario inactivo', status: 403 as const }
  if (!puede(me.rol, me.permisos_custom ?? null, 'convenios', accion)) {
    return { error: 'sin permiso sobre troqueles', status: 403 as const }
  }
  return { ok: true as const, userId: user.id, sucursalId: me.sucursal_id }
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null)
  const accion = String(b?.accion ?? '')
  const g = await gate(accion === 'enviar' ? 'crear' : 'editar')
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })

  const adm = createAdminClient()

  // La sucursal se verifica contra la presentación. El cuerpo no decide nada.
  const presId = accion === 'enviar' ? b?.presentacion_id : null
  if (accion === 'enviar') {
    const { data: p } = await adm.from('convenio_presentaciones')
      .select('sucursal_id, estado').eq('id', presId).maybeSingle()
    if (!p) return NextResponse.json({ error: 'la presentación no existe' }, { status: 404 })
    if (g.sucursalId && (p as any).sucursal_id !== g.sucursalId) {
      return NextResponse.json({ error: 'esa presentación es de otra sucursal' }, { status: 403 })
    }
  }

  // ── EL ENVÍO ────────────────────────────────────────────────────────────
  if (accion === 'enviar') {
    if (!b?.remito_numero) {
      return NextResponse.json({
        error: 'Falta el número de remito. Sin remito no se puede probar que los troqueles salieron, y un débito por troquel faltante queda sin defensa.',
      }, { status: 400 })
    }
    const { data, error } = await adm.from('convenio_troqueles').insert({
      presentacion_id: presId,
      cantidad: b?.cantidad == null || b.cantidad === '' ? null : Number(b.cantidad),
      remito_numero: String(b.remito_numero).trim(),
      transporte: b?.transporte ?? null,
      enviado_at: b?.enviado_at ?? new Date().toISOString().slice(0, 10),
      enviado_por: g.userId,
      foto_remito_url: b?.foto_remito_url ?? null,
      notas: b?.notas ?? null,
    }).select('id').maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({
      ok: true, id: data?.id,
      aviso: b?.foto_remito_url
        ? null
        : 'Quedó registrado sin foto del remito. El número solo alcanza para buscar; la foto es la que sirve para reclamar.',
    })
  }

  // ── EL ACUSE ────────────────────────────────────────────────────────────
  if (accion === 'acusar') {
    const { data: t } = await adm.from('convenio_troqueles')
      .select('id, presentacion_id, convenio_presentaciones(sucursal_id)')
      .eq('id', b?.id).maybeSingle()
    if (!t) return NextResponse.json({ error: 'ese envío no existe' }, { status: 404 })
    const suc = (t as any).convenio_presentaciones?.sucursal_id
    if (g.sucursalId && suc !== g.sucursalId) {
      return NextResponse.json({ error: 'ese envío es de otra sucursal' }, { status: 403 })
    }

    const { error } = await adm.from('convenio_troqueles').update({
      acuse_at: b?.acuse_at ?? new Date().toISOString().slice(0, 10),
      acuse_por: g.userId,
      acuse_foto_url: b?.acuse_foto_url ?? null,
    }).eq('id', b.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({
      ok: true,
      aviso: b?.acuse_foto_url
        ? null
        : 'Acuse registrado sin foto. Si esta obra social debita por troquel faltante, la foto del acuse es lo único que se puede mostrar.',
    })
  }

  return NextResponse.json({ error: `acción desconocida: ${accion}` }, { status: 400 })
}
