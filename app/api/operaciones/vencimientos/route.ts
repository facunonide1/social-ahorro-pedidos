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

/**
 * POST:
 *  - { accion: 'cargar', items: [...] }
 *  - { accion: 'resolver', origen, id?, lote_id?, resolucion, nota?, producto?, sucursal_id? }
 *  - { accion: 'devolver', ... } → crea la devolución + tarea con evidencia foto.
 *    El stock se descuenta recién cuando esa tarea se completa (hook en tareas).
 */
export async function POST(req: NextRequest) {
  const g = await gate()
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'body inválido' }, { status: 400 }) }
  const adm = createAdminClient()

  if (b?.accion === 'cargar') {
    const items = (Array.isArray(b?.items) ? b.items : []).filter((i: any) => i.sucursal_id && i.fecha_vencimiento && Number(i.cantidad) > 0)
    if (!items.length) return NextResponse.json({ error: 'cargá al menos un producto con fecha y cantidad' }, { status: 400 })
    const { error } = await adm.from('vencimientos').insert(items.map((i: any) => ({
      producto_id: i.producto_id ?? null, sku: i.sku ?? null, sucursal_id: i.sucursal_id,
      proveedor_id: i.proveedor_id ?? null,
      fecha_vencimiento: i.fecha_vencimiento, cantidad: Number(i.cantidad),
      ubicacion: i.ubicacion === 'deposito' ? 'deposito' : 'gondola', created_by: g.userId,
    })))
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, cargados: items.length })
  }

  // ---- DEVOLVER (OS-3 · C): crea la devolución + tarea con evidencia. NO descuenta stock aún. ----
  if (b?.accion === 'devolver') {
    const { producto_id, sku, sucursal_id, proveedor_id, cantidad, costo, producto, fecha_limite, origen, lote_id, vencimiento_id } = b
    if (!sucursal_id || !(Number(cantidad) > 0)) return NextResponse.json({ error: 'faltan datos de la devolución' }, { status: 400 })
    const { data: dev, error } = await adm.from('devoluciones_drogueria').insert({
      proveedor_id: proveedor_id ?? null, sucursal_id, producto_id: producto_id ?? null, sku: sku ?? null,
      cantidad: Number(cantidad), costo_unitario: costo != null ? Number(costo) : null, motivo: 'vencimiento',
      estado: 'pendiente', vencimiento_id: origen === 'manual' ? (vencimiento_id ?? null) : null,
      lote_id: origen === 'lote' ? (lote_id ?? null) : null, fecha_limite: fecha_limite ?? null, created_by: g.userId,
    }).select('id').single()
    if (error || !dev) return NextResponse.json({ error: error?.message ?? 'no se pudo registrar' }, { status: 400 })

    const { data: tarea } = await adm.from('tareas').insert({
      titulo: `Preparar devolución a droguería: ${producto ?? sku ?? 'producto'}`,
      descripcion: `Contá y preparás ${Number(cantidad)} u. para devolver${fecha_limite ? ` antes del ${fecha_limite}` : ''}. Sacá foto del armado. Al completar, se descuenta el stock.`,
      tipo_origen: 'auto_sistema', prioridad: 'alta', estado: 'pendiente', verificacion_humana: true,
      sucursal_id, entidad_relacionada: 'devolucion_drogueria', entidad_id: dev.id,
      evidencias: [], creado_por: g.userId,
    }).select('id').single()
    if (tarea?.id) await adm.from('devoluciones_drogueria').update({ tarea_id: tarea.id }).eq('id', dev.id)
    // La fila manual queda marcada como resuelta por devolución (no vuelve a aparecer).
    if (origen === 'manual' && vencimiento_id) {
      await adm.from('vencimientos').update({ estado: 'resuelto', resolucion: 'devolucion', resuelto_at: new Date().toISOString() }).eq('id', vencimiento_id)
    }
    return NextResponse.json({ ok: true, devolucion_id: dev.id, tarea_id: tarea?.id })
  }

  if (b?.accion === 'resolver') {
    const res = String(b?.resolucion ?? 'baja')
    const origen = b?.origen ?? 'manual'

    if (origen === 'manual' && b?.id) {
      await adm.from('vencimientos').update({ estado: 'resuelto', resolucion: res, nota: b?.nota ?? null, resuelto_at: new Date().toISOString() }).eq('id', b.id)
    } else if (origen === 'lote' && b?.lote_id && res === 'baja') {
      // Baja de lote vencido: registra el movimiento y marca el lote.
      if (b?.producto_id && b?.sucursal_id) {
        await adm.from('movimientos_stock').insert({
          producto_id: b.producto_id, sucursal_id: b.sucursal_id, tipo: 'baja_vencimiento',
          cantidad: -Math.abs(Number(b?.cantidad ?? 0)), ubicacion: 'deposito', motivo: 'Baja por vencimiento (lote)',
          referencia_tipo: 'lote', referencia_id: b.lote_id, costo_unitario: b?.costo ?? null, created_by: g.userId,
        })
      }
      await adm.from('lotes_productos').update({ estado: 'vencido', cantidad_actual: 0 }).eq('id', b.lote_id)
    }

    // reponer / tarea → genera una tarea operativa (ambos orígenes).
    if ((res === 'reponer' || res === 'tarea') && b?.producto && b?.sucursal_id) {
      await adm.from('tareas').insert({
        titulo: res === 'reponer' ? `Reponer góndola: ${b.producto}` : `Control vencimiento: ${b.producto}`,
        descripcion: b?.nota ?? 'Generada desde Vencimientos por NORA.',
        tipo_origen: 'auto_sistema', prioridad: 'alta', estado: 'pendiente',
        sucursal_id: b.sucursal_id, entidad_relacionada: 'vencimiento', entidad_id: b?.id ?? b?.lote_id ?? null,
        creado_por: g.userId,
      })
    }
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'acción inválida' }, { status: 400 })
}
