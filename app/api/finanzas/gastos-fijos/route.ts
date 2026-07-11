import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { AdminRole } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

async function gate() {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: 'no autenticado', status: 401 as const }
  const { data: me } = await sb.from('users_admin').select('rol, activo').eq('id', user.id).maybeSingle<{ rol: AdminRole; activo: boolean }>()
  if (!me || !me.activo || !['super_admin', 'gerente', 'tesoreria'].includes(me.rol)) {
    return { error: 'sin permiso', status: 403 as const }
  }
  return { ok: true as const, userId: user.id }
}

/** Alta/edición de gasto fijo recurrente (FIN · T6). */
export async function POST(req: NextRequest) {
  const g = await gate()
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })

  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'body inválido' }, { status: 400 }) }
  const adm = createAdminClient()

  // OS-4b · E: marcar instancia pagada con monto REAL + alerta de desvío.
  if (b?.accion === 'pagar_instancia') {
    if (!b?.instancia_id) return NextResponse.json({ error: 'instancia requerida' }, { status: 400 })
    const { data: inst } = await adm.from('gastos_fijos_instancias').select('id, monto, periodo, gastos_fijos(concepto, sucursal_id)').eq('id', b.instancia_id).maybeSingle<any>()
    if (!inst) return NextResponse.json({ error: 'instancia inexistente' }, { status: 404 })
    const esperado = Number(inst.monto ?? 0)
    const montoReal = b?.monto_real != null && Number(b.monto_real) > 0 ? Number(b.monto_real) : esperado
    await adm.from('gastos_fijos_instancias').update({ estado: 'pagado', monto_real: montoReal }).eq('id', inst.id)

    const UMBRAL_DESVIO = 15
    const desvio = esperado > 0 ? ((montoReal - esperado) / esperado) * 100 : 0
    if (esperado > 0 && Math.abs(desvio) > UMBRAL_DESVIO) {
      const { data: sup } = await adm.from('users_admin').select('id').eq('activo', true).in('rol', ['super_admin', 'gerente', 'tesoreria'])
      if (sup?.length) await adm.from('notificaciones_admin').insert((sup as any[]).map((s) => ({
        user_id: s.id, tipo: 'alerta', prioridad: 'alta',
        titulo: `Desvío en ${inst.gastos_fijos?.concepto ?? 'gasto fijo'}`,
        mensaje: `${inst.periodo}: vino ${desvio > 0 ? '+' : ''}${Math.round(desvio)}% (${'$' + Math.round(montoReal).toLocaleString('es-AR')} vs ${'$' + Math.round(esperado).toLocaleString('es-AR')}).`,
        url_accion: '/admin/finanzas/gastos-fijos',
      })))
    }
    return NextResponse.json({ ok: true, desvio: Math.round(desvio) })
  }

  const concepto = String(b?.concepto ?? '').trim()
  if (!concepto) return NextResponse.json({ error: 'concepto requerido' }, { status: 400 })

  const payload = {
    concepto,
    tipo: b?.tipo ?? 'otro',
    sucursal_id: b?.sucursal_id || null,
    monto: b?.monto != null ? Number(b.monto) : null,
    frecuencia: b?.frecuencia ?? 'mensual',
    dia_mes: Math.min(28, Math.max(1, Number(b?.dia_mes ?? 1))),
    proveedor_id: b?.proveedor_id || null,
    activo: b?.activo ?? true,
  }

  if (b?.id) {
    const { error } = await adm.from('gastos_fijos').update(payload).eq('id', b.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, id: b.id })
  }
  const { data, error } = await adm.from('gastos_fijos').insert({ ...payload, created_by: g.userId }).select('id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, id: data.id })
}
