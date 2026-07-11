import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { ejecutarEfectosPago } from '@/app/api/finanzas/pagos/route'
import type { AdminRole } from '@/lib/types/admin'
import { puede, type PermisosCustom } from '@/lib/types/permisos'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Resuelve una solicitud de aprobación (OS-4b · C). Primer flujo CABLEADO del
 * módulo /admin/aprobaciones: al aprobar un `pago_alto`, ejecuta los efectos del
 * pago (mueve el dinero + marca la factura). Al rechazar, anula el pago.
 * body: { aprobacion_id, accion: 'aprobar'|'rechazar', comentarios? }
 */
export async function POST(req: NextRequest) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no autenticado' }, { status: 401 })
  const { data: me } = await sb.from('users_admin').select('rol, activo, permisos_custom').eq('id', user.id).maybeSingle<{ rol: AdminRole; activo: boolean; permisos_custom: PermisosCustom | null }>()
  if (!me?.activo) return NextResponse.json({ error: 'sin permiso' }, { status: 403 })
  const puedeResolver = me.rol === 'super_admin' || me.rol === 'gerente' || puede(me.rol, me.permisos_custom ?? null, 'finanzas', 'aprobar')
  if (!puedeResolver) return NextResponse.json({ error: 'sin permiso para aprobar' }, { status: 403 })

  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'body inválido' }, { status: 400 }) }
  const accion = b?.accion === 'rechazar' ? 'rechazar' : 'aprobar'
  if (!b?.aprobacion_id) return NextResponse.json({ error: 'aprobación requerida' }, { status: 400 })

  const adm = createAdminClient()
  const { data: ap } = await adm.from('aprobaciones').select('*').eq('id', b.aprobacion_id).maybeSingle<any>()
  if (!ap) return NextResponse.json({ error: 'aprobación inexistente' }, { status: 404 })
  if (ap.estado !== 'pendiente') return NextResponse.json({ error: 'ya resuelta' }, { status: 409 })

  if (accion === 'rechazar') {
    if (ap.tipo === 'pago_alto' && ap.entidad_id) {
      await adm.from('pagos').update({ estado: 'anulado' }).eq('id', ap.entidad_id)
    }
    await adm.from('aprobaciones').update({ estado: 'rechazada', aprobador_id: user.id, comentarios: b?.comentarios ?? null, resolved_at: new Date().toISOString() }).eq('id', ap.id)
    return NextResponse.json({ ok: true, estado: 'rechazada' })
  }

  // aprobar: si es un pago, ejecutar sus efectos (puede frenar por saldo)
  if (ap.tipo === 'pago_alto' && ap.entidad_id) {
    try {
      await ejecutarEfectosPago(adm, ap.entidad_id, user.id)
      await adm.from('pagos').update({ estado: 'ejecutado', aprobado_por: user.id, ejecutado_por: user.id }).eq('id', ap.entidad_id)
    } catch (e: any) {
      return NextResponse.json({ error: e?.message ?? 'No se pudo ejecutar el pago', frena: true }, { status: 422 })
    }
  }
  await adm.from('aprobaciones').update({ estado: 'aprobada', aprobador_id: user.id, comentarios: b?.comentarios ?? null, resolved_at: new Date().toISOString() }).eq('id', ap.id)
  return NextResponse.json({ ok: true, estado: 'aprobada' })
}
