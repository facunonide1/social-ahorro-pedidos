import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { AdminRole } from '@/lib/types/admin'
import { puedeAprobarRetiros, type PermisosCustom } from '@/lib/types/permisos'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type Gate = { rol: AdminRole; userId: string; permisosCustom: PermisosCustom }

async function gate(): Promise<Gate | { error: string; status: 401 | 403 }> {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: 'no autenticado', status: 401 }
  const { data: me } = await sb.from('users_admin').select('rol, activo, permisos_custom').eq('id', user.id).maybeSingle<{ rol: AdminRole; activo: boolean; permisos_custom: PermisosCustom | null }>()
  if (!me || !me.activo) return { error: 'sin permiso', status: 403 }
  return { rol: me.rol, userId: user.id, permisosCustom: me.permisos_custom ?? {} }
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

  // ---- abrir turno (cajero/encargado de la sucursal) ----
  if (action === 'abrir_turno') {
    if (!can('super_admin', 'gerente', 'tesoreria', 'sucursal', 'administrativo', 'cajero', 'encargado_sucursal')) return NextResponse.json({ error: 'sin permiso' }, { status: 403 })
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

  // ---- PASO 1: CONFIRMAR CONTEO (a ciegas) — sella el conteo, sin ver sistema ni diferencia (OS-4b · A) ----
  if (action === 'confirmar_conteo') {
    if (!can('super_admin', 'gerente', 'tesoreria', 'sucursal', 'administrativo', 'cajero', 'encargado_sucursal')) {
      return NextResponse.json({ error: 'sin permiso' }, { status: 403 })
    }
    const { data: t } = await adm.from('caja_turnos').select('*').eq('id', b?.turno_id).maybeSingle()
    if (!t) return NextResponse.json({ error: 'turno inexistente' }, { status: 404 })
    if (t.estado !== 'abierto') return NextResponse.json({ error: 'el turno ya fue cerrado' }, { status: 409 })
    const esSupervisor = can('super_admin', 'gerente', 'tesoreria', 'encargado_sucursal', 'administrativo')
    if (!esSupervisor && t.cajero_user_id !== g.userId) {
      return NextResponse.json({ error: 'solo podés cerrar tu propia caja' }, { status: 403 })
    }
    if (!b?.captura_url) return NextResponse.json({ error: 'subí la captura del arqueo de SIFACO' }, { status: 400 })
    // INMUTABILIDAD: si el conteo de este turno ya se confirmó, no se puede rehacer.
    const { data: ya } = await adm.from('arqueos_caja').select('id, conteo_confirmado_at').eq('caja_turno_id', t.id).maybeSingle()
    if (ya?.conteo_confirmado_at) return NextResponse.json({ error: 'el conteo de este turno ya fue confirmado y es inmutable' }, { status: 409 })

    const inicio = Number(b?.inicio_caja ?? t.apertura ?? 0)
    const efectivo = Number(b?.total_efectivo ?? 0)
    const mp = Number(b?.total_mercadopago ?? 0)
    const tarjetas = Number(b?.total_tarjetas ?? 0)
    let cajeroNombre: string | null = null
    try { const { data: au } = await adm.auth.admin.getUserById(g.userId); cajeroNombre = (au?.user?.user_metadata as any)?.nombre ?? au?.user?.email ?? null } catch { /* */ }

    const { data: arqueo, error: eArq } = await adm.from('arqueos_caja').insert({
      sucursal_id: t.sucursal_id, caja_turno_id: t.id, cajero_id: g.userId, cajero_nombre: cajeroNombre,
      fecha: t.fecha, inicio_caja: inicio, total_efectivo: efectivo, total_mercadopago: mp, total_tarjetas: tarjetas,
      total_sistema: 0, diferencia_cierre: 0, efectivo_a_general: 0, captura_url: b.captura_url,
      estado: 'en_contraste', conteo_confirmado_at: new Date().toISOString(),
    }).select('id').single()
    if (eArq) return NextResponse.json({ error: eArq.message }, { status: 400 })
    return NextResponse.json({ ok: true, arqueo_id: arqueo.id, paso: 1 })
  }

  // ---- PASO 2: CONTRASTAR — recién ahora entra el total SIFACO + hora, y se revela la diferencia ----
  if (action === 'contrastar') {
    if (!can('super_admin', 'gerente', 'tesoreria', 'sucursal', 'administrativo', 'cajero', 'encargado_sucursal')) {
      return NextResponse.json({ error: 'sin permiso' }, { status: 403 })
    }
    const { data: arq } = await adm.from('arqueos_caja').select('*').eq('id', b?.arqueo_id).maybeSingle()
    if (!arq) return NextResponse.json({ error: 'arqueo inexistente' }, { status: 404 })
    if (arq.estado !== 'en_contraste') return NextResponse.json({ error: 'este arqueo no está esperando contraste' }, { status: 409 })

    const sistema = Number(b?.total_sistema ?? 0)
    const horaSifaco = String(b?.hora_cierre_sifaco ?? '').trim()
    const declarado = Number(arq.total_efectivo) + Number(arq.total_mercadopago) + Number(arq.total_tarjetas)
    const diferencia = sistema > 0 ? declarado - sistema : 0
    const estado = diferencia === 0 ? 'cerrada' : 'observada'

    // Defensa: si el cliente reenvía montos distintos a los sellados → secuencia alterada.
    let secuenciaAlterada = Boolean(arq.secuencia_alterada)
    if (b?.total_efectivo != null && Number(b.total_efectivo) !== Number(arq.total_efectivo)) secuenciaAlterada = true
    if (b?.total_mercadopago != null && Number(b.total_mercadopago) !== Number(arq.total_mercadopago)) secuenciaAlterada = true
    if (b?.total_tarjetas != null && Number(b.total_tarjetas) !== Number(arq.total_tarjetas)) secuenciaAlterada = true

    // carga_posterior: el conteo se confirmó DESPUÉS de la hora de cierre del POS.
    let cargaPosterior = false
    const m = horaSifaco.match(/(\d{1,2}):(\d{2})/)
    if (m && arq.conteo_confirmado_at) {
      const sifacoMin = Number(m[1]) * 60 + Number(m[2])
      const hhmm = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(arq.conteo_confirmado_at))
      const cm = hhmm.match(/(\d{2}):(\d{2})/)
      const conteoMin = cm ? Number(cm[1]) * 60 + Number(cm[2]) : 0
      cargaPosterior = conteoMin > sifacoMin
    }

    const { data: cfg } = await adm.from('config_caja_sucursal').select('fondo_fijo').eq('sucursal_id', arq.sucursal_id).maybeSingle()
    const fondo = Number(cfg?.fondo_fijo ?? arq.inicio_caja ?? 0)
    const efectivoAGeneral = Math.max(0, Number(arq.total_efectivo) - fondo)

    await adm.from('arqueos_caja').update({
      total_sistema: sistema, diferencia_cierre: diferencia, efectivo_a_general: efectivoAGeneral, estado,
      hora_cierre_sifaco: horaSifaco || null, carga_posterior: cargaPosterior, secuencia_alterada: secuenciaAlterada,
      observacion: b?.observacion ?? arq.observacion,
    }).eq('id', arq.id)

    await adm.from('caja_turnos').update({
      contado: Number(arq.total_efectivo), esperado: sistema, diferencia, fondo_dejado: fondo,
      retiro_a_general: efectivoAGeneral, ventas_efectivo: 0, pagos_efectivo: 0, estado: 'aprobado',
    }).eq('id', arq.caja_turno_id)

    if (efectivoAGeneral > 0) {
      const cg = await getCajaGeneral(adm, arq.sucursal_id)
      await adm.from('caja_general_movimientos').insert({
        caja_general_id: cg.id, tipo: 'entrada_turno', monto: efectivoAGeneral,
        referencia_tipo: 'arqueo_caja', referencia_id: arq.id, estado: 'aprobado',
        solicitado_por: g.userId, aprobado_por: g.userId, notas: `Arqueo cierre ${arq.fecha}`,
      })
    }
    return NextResponse.json({ ok: true, total_declarado: declarado, diferencia, estado, efectivo_a_general: efectivoAGeneral, carga_posterior: cargaPosterior, secuencia_alterada: secuenciaAlterada })
  }

  // ---- caja chica: gasto desde caja general con foto obligatoria (OS-4b · D) ----
  if (action === 'gasto_caja_chica') {
    if (!can('super_admin', 'gerente', 'tesoreria', 'sucursal', 'administrativo', 'cajero', 'encargado_sucursal')) {
      return NextResponse.json({ error: 'sin permiso' }, { status: 403 })
    }
    const CATS = ['libreria', 'limpieza', 'mantenimiento', 'viaticos', 'otros']
    const categoria = CATS.includes(b?.categoria) ? b.categoria : 'otros'
    const monto = Number(b?.monto ?? 0)
    if (!b?.sucursal_id || !(monto > 0)) return NextResponse.json({ error: 'sucursal y monto (>0) requeridos' }, { status: 400 })
    if (!b?.comprobante_url) return NextResponse.json({ error: 'la foto del comprobante es obligatoria' }, { status: 400 })
    const cg = await getCajaGeneral(adm, b.sucursal_id)
    if (Number(cg.saldo_actual ?? 0) < monto) return NextResponse.json({ error: 'Saldo insuficiente en la caja general.', frena: true }, { status: 422 })
    const { error } = await adm.from('caja_general_movimientos').insert({
      caja_general_id: cg.id, tipo: 'gasto_caja_chica', monto: -monto, categoria,
      comprobante_url: b.comprobante_url, estado: 'aprobado', solicitado_por: g.userId, aprobado_por: g.userId,
      notas: String(b?.descripcion ?? '').slice(0, 200) || categoria,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
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

  // ---- aprobar / rechazar movimiento (permiso fino: aprobar retiros) ----
  if (action === 'aprobar' || action === 'rechazar') {
    if (!puedeAprobarRetiros(g.rol, g.permisosCustom)) return NextResponse.json({ error: 'sin permiso para aprobar retiros (caja:aprobar)' }, { status: 403 })
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
