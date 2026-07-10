import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { AdminRole } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const ROLES: AdminRole[] = ['super_admin', 'gerente', 'sucursal', 'encargado_sucursal', 'administrativo', 'auditor']

async function gate() {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: 'no autenticado', status: 401 as const }
  const { data: me } = await sb.from('users_admin').select('rol, activo').eq('id', user.id).maybeSingle<{ rol: AdminRole; activo: boolean }>()
  if (!me?.activo || !ROLES.includes(me.rol)) return { error: 'sin permiso', status: 403 as const }
  return { ok: true as const, userId: user.id }
}

export async function POST(req: NextRequest) {
  const g = await gate()
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'body inválido' }, { status: 400 }) }
  const adm = createAdminClient()

  // ── configurar zonas ──
  if (b?.accion === 'guardar_zona') {
    if (!b?.sucursal_id || !b?.nombre) return NextResponse.json({ error: 'sucursal y nombre requeridos' }, { status: 400 })
    const payload = {
      sucursal_id: b.sucursal_id, nombre: String(b.nombre).slice(0, 80), tipo: b?.tipo ?? 'gondola',
      responsable_id: b?.responsable_id || null, dia_control: b?.dia_control ?? null, activa: b?.activa !== false,
    }
    if (b?.id) { await adm.from('zonas').update(payload).eq('id', b.id); return NextResponse.json({ ok: true, id: b.id }) }
    const { data, error } = await adm.from('zonas').insert(payload).select('id').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, id: data.id })
  }
  if (b?.accion === 'borrar_zona') {
    if (!b?.id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
    await adm.from('zonas').update({ activa: false }).eq('id', b.id)
    return NextResponse.json({ ok: true })
  }

  // ── generar controles (manual; el cron usa la misma RPC) ──
  if (b?.accion === 'generar') {
    const { data, error } = await adm.rpc('generar_controles_zona', { p_dia: b?.dia ?? null })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, ...data })
  }

  // ── contar una zona: guarda items (contado vs sistema) ──
  if (b?.accion === 'guardar_conteo') {
    if (!b?.control_id) return NextResponse.json({ error: 'control requerido' }, { status: 400 })
    const { data: ctrl } = await adm.from('controles_zona').select('sucursal_id, tarea_id, estado').eq('id', b.control_id).maybeSingle<any>()
    if (!ctrl) return NextResponse.json({ error: 'control no encontrado' }, { status: 404 })
    const items = (Array.isArray(b?.items) ? b.items : []).filter((i: any) => i.producto_id)
    await adm.from('control_zona_items').delete().eq('control_id', b.control_id)
    let nDif = 0, valorDif = 0
    const rows: any[] = []
    for (const i of items) {
      const { data: si } = await adm.from('stock_items').select('cantidad').eq('producto_id', i.producto_id).eq('sucursal_id', ctrl.sucursal_id).maybeSingle()
      const { data: pc } = await adm.from('productos_catalogo').select('precio_costo_promedio, precio_sugerido').eq('id', i.producto_id).maybeSingle()
      const sistema = Number(si?.cantidad ?? 0)
      const contado = Number(i.contado ?? 0)
      const dif = contado - sistema
      const costo = Number(pc?.precio_costo_promedio ?? 0) || Number(pc?.precio_sugerido ?? 0) * 0.6
      const vdif = Math.round(dif * costo)
      if (dif !== 0) nDif++
      valorDif += Math.abs(vdif)
      rows.push({ control_id: b.control_id, producto_id: i.producto_id, sku: i.sku ?? null, stock_sistema: sistema, stock_contado: contado, diferencia: dif, valor_diferencia: vdif })
    }
    if (rows.length) await adm.from('control_zona_items').insert(rows)
    const cerrar = !!b?.cerrar
    await adm.from('controles_zona').update({
      n_productos: rows.length, n_diferencias: nDif, valor_diferencia: valorDif,
      estado: cerrar ? 'cerrado' : 'en_curso', cerrado_at: cerrar ? new Date().toISOString() : null,
    }).eq('id', b.control_id)
    if (cerrar && ctrl.tarea_id) {
      await adm.from('tareas').update({ estado: 'completada', fecha_completada: new Date().toISOString() }).eq('id', ctrl.tarea_id)
    }
    return NextResponse.json({ ok: true, diferencias: nDif, valor: valorDif })
  }

  return NextResponse.json({ error: 'acción inválida' }, { status: 400 })
}
