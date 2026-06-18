import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { AdminRole } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type Gate = { rol: AdminRole; userId: string }

async function gate(): Promise<Gate | { error: string; status: 401 | 403 }> {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: 'no autenticado', status: 401 }
  const { data: me } = await sb.from('users_admin').select('rol, activo').eq('id', user.id).maybeSingle<{ rol: AdminRole; activo: boolean }>()
  if (!me || !me.activo) return { error: 'sin permiso', status: 403 }
  return { rol: me.rol, userId: user.id }
}

/** Obtiene (o crea) la caja general de una sucursal. */
async function getCajaGeneral(adm: ReturnType<typeof createAdminClient>, sucursal_id: string) {
  const { data } = await adm.from('caja_general').select('id, saldo_actual').eq('sucursal_id', sucursal_id).eq('tipo', 'caja_general').maybeSingle()
  if (data) return data
  const { data: nueva } = await adm.from('caja_general').insert({ sucursal_id, tipo: 'caja_general', saldo_actual: 0 }).select('id, saldo_actual').single()
  return nueva!
}

/**
 * Caja multinivel (FIN · T7). Acciones via { action }:
 * - config: fondo fijo por sucursal (super/gerente)
 * - abrir_turno / cerrar_turno: caja del turno con arqueo ciego
 * - retiro_socios: solicita salida de caja general (requiere aprobación)
 * - aprobar / rechazar: super_admin resuelve movimientos pendientes
 */
export async function POST(req: NextRequest) {
  const g = await gate()
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })

  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'body inválido' }, { status: 400 }) }
  const action = String(b?.action ?? '')
  const adm = createAdminClient()
  const can = (...roles: AdminRole[]) => roles.includes(g.rol)

  // ---- config fondo fijo ----
  if (action === 'config') {
    if (!can('super_admin', 'gerente')) return NextResponse.json({ error: 'requiere super_admin/gerente' }, { status: 403 })
    if (!b?.sucursal_id) return NextResponse.json({ error: 'sucursal requerida' }, { status: 400 })
    const { error } = await adm.from('config_caja_sucursal').upsert({
      sucursal_id: b.sucursal_id, fondo_fijo: Number(b.fondo_fijo ?? 0),
      usa_caja_general: b.usa_caja_general ?? true, usa_caja_fuerte: b.usa_caja_fuerte ?? false,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'sucursal_id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  // ---- abrir turno ----
  if (action === 'abrir_turno') {
    if (!can('super_admin', 'gerente', 'tesoreria', 'sucursal', 'administrativo')) return NextResponse.json({ error: 'sin permiso' }, { status: 403 })
    if (!b?.sucursal_id) return NextResponse.json({ error: 'sucursal requerida' }, { status: 400 })
    const { data: cfg } = await adm.from('config_caja_sucursal').select('fondo_fijo').eq('sucursal_id', b.sucursal_id).maybeSingle()
    const fondo = Number(cfg?.fondo_fijo ?? 0)
    const { data, error } = await adm.from('caja_turnos').insert({
      sucursal_id: b.sucursal_id, fecha: b?.fecha ?? new Date().toISOString().slice(0, 10),
      cajero_user_id: g.userId, apertura: fondo, estado: 'abierto', arqueo_ciego: true,
    }).select('id').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, id: data.id, apertura: fondo })
  }

  // ---- cerrar turno (arqueo ciego) ----
  if (action === 'cerrar_turno') {
    if (!can('super_admin', 'gerente', 'tesoreria', 'sucursal', 'administrativo')) return NextResponse.json({ error: 'sin permiso' }, { status: 403 })
    const { data: t } = await adm.from('caja_turnos').select('*').eq('id', b?.turno_id).maybeSingle()
    if (!t) return NextResponse.json({ error: 'turno inexistente' }, { status: 404 })
    if (t.estado !== 'abierto') return NextResponse.json({ error: 'el turno ya fue cerrado' }, { status: 409 })

    const ventas = Number(b?.ventas_efectivo ?? 0)
    const pagos = Number(b?.pagos_efectivo ?? 0)
    const contado = Number(b?.contado ?? 0)
    const { data: cfg } = await adm.from('config_caja_sucursal').select('fondo_fijo').eq('sucursal_id', t.sucursal_id).maybeSingle()
    const fondo = Number(cfg?.fondo_fijo ?? t.apertura ?? 0)

    const esperado = Number(t.apertura) + ventas - pagos
    const diferencia = contado - esperado
    const fondoDejado = Math.min(fondo, Math.max(0, contado))
    const retiro = Math.max(0, contado - fondoDejado)

    const { error: eUpd } = await adm.from('caja_turnos').update({
      ventas_efectivo: ventas, pagos_efectivo: pagos, esperado, contado, diferencia,
      fondo_dejado: fondoDejado, retiro_a_general: retiro,
      estado: 'cerrado_pendiente_aprobacion',
    }).eq('id', t.id)
    if (eUpd) return NextResponse.json({ error: eUpd.message }, { status: 400 })

    // Retiro turno → caja general (REQUIERE APROBACIÓN)
    if (retiro > 0) {
      const cg = await getCajaGeneral(adm, t.sucursal_id)
      await adm.from('caja_general_movimientos').insert({
        caja_general_id: cg.id, tipo: 'entrada_turno', monto: retiro,
        referencia_tipo: 'caja_turno', referencia_id: t.id, estado: 'pendiente_aprobacion',
        solicitado_por: g.userId, notas: `Remanente turno ${t.fecha}`,
      })
    }
    return NextResponse.json({ ok: true, esperado, diferencia, fondo_dejado: fondoDejado, retiro_a_general: retiro })
  }

  // ---- retiro de socios (salida de caja general, requiere aprobación) ----
  if (action === 'retiro_socios') {
    if (!can('super_admin', 'gerente')) return NextResponse.json({ error: 'requiere super_admin/gerente' }, { status: 403 })
    const monto = Number(b?.monto ?? 0)
    if (!b?.sucursal_id || !(monto > 0)) return NextResponse.json({ error: 'sucursal y monto (>0) requeridos' }, { status: 400 })
    const cg = await getCajaGeneral(adm, b.sucursal_id)
    await adm.from('caja_general_movimientos').insert({
      caja_general_id: cg.id, tipo: 'retiro_socios', monto: -monto,
      estado: 'pendiente_aprobacion', solicitado_por: g.userId, notas: b?.notas ?? 'Retiro de socios',
    })
    return NextResponse.json({ ok: true })
  }

  // ---- aprobar / rechazar movimiento (super_admin) ----
  if (action === 'aprobar' || action === 'rechazar') {
    if (!can('super_admin')) return NextResponse.json({ error: 'requiere super_admin' }, { status: 403 })
    const { data: mov } = await adm.from('caja_general_movimientos').select('id, monto, estado, caja_general_id, tipo, referencia_id').eq('id', b?.movimiento_id).maybeSingle()
    if (!mov) return NextResponse.json({ error: 'movimiento inexistente' }, { status: 404 })
    if (mov.estado !== 'pendiente_aprobacion') return NextResponse.json({ error: 'ya resuelto' }, { status: 409 })

    if (action === 'rechazar') {
      await adm.from('caja_general_movimientos').update({ estado: 'rechazado', aprobado_por: g.userId }).eq('id', mov.id)
      return NextResponse.json({ ok: true })
    }
    // aprobar: si es salida, validar saldo
    if (Number(mov.monto) < 0) {
      const { data: cg } = await adm.from('caja_general').select('saldo_actual').eq('id', mov.caja_general_id).maybeSingle()
      if (Number(cg?.saldo_actual ?? 0) < Math.abs(Number(mov.monto))) {
        return NextResponse.json({ error: 'Saldo insuficiente en caja general para aprobar la salida.', frena: true }, { status: 422 })
      }
    }
    // el trigger aplica el saldo al pasar a 'aprobado'
    const { error } = await adm.from('caja_general_movimientos').update({ estado: 'aprobado', aprobado_por: g.userId }).eq('id', mov.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    if (mov.tipo === 'entrada_turno' && mov.referencia_id) {
      await adm.from('caja_turnos').update({ estado: 'aprobado' }).eq('id', mov.referencia_id)
    }
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'acción desconocida' }, { status: 400 })
}
