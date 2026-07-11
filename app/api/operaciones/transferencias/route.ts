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
  if (!me?.activo || !ROLES.includes(me.rol)) return { error: 'sin permiso para transferencias', status: 403 as const }
  return { ok: true as const, userId: user.id }
}

/** Mueve stock en una sucursal: signo +/− sobre góndola o depósito. */
async function moverStock(adm: any, productoId: string, sucursalId: string, ubic: 'gondola' | 'deposito', delta: number) {
  const { data: si } = await adm.from('stock_items').select('id, cantidad_gondola, cantidad_deposito').eq('producto_id', productoId).eq('sucursal_id', sucursalId).maybeSingle()
  const col = ubic === 'gondola' ? 'cantidad_gondola' : 'cantidad_deposito'
  const prev = Number(si?.[col] ?? 0)
  await adm.from('stock_items').upsert({
    producto_id: productoId, sucursal_id: sucursalId, [col]: prev + delta, updated_at: new Date().toISOString(),
  }, { onConflict: 'producto_id,sucursal_id' })
}

export async function POST(req: NextRequest) {
  const g = await gate()
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'body inválido' }, { status: 400 }) }
  const adm = createAdminClient()
  const accion = b?.accion

  // ───────── 1) SE CREA (pendiente de salida) + foto de la transferencia SIFACO ─────────
  if (accion === 'crear') {
    const { origen, destino, items, foto, notas } = b
    if (!origen || !destino || origen === destino) return NextResponse.json({ error: 'elegí origen y destino distintos' }, { status: 400 })
    const lineas = (Array.isArray(items) ? items : []).filter((i: any) => i.producto_id && Number(i.cantidad) > 0)
    if (!lineas.length) return NextResponse.json({ error: 'agregá al menos un producto' }, { status: 400 })
    const { data: tr, error } = await adm.from('transferencias_sucursal').insert({
      sucursal_origen_id: origen, sucursal_destino_id: destino, estado: 'pendiente_salida',
      fecha_solicitud: new Date().toISOString(), solicitado_por: g.userId,
      foto_creacion: foto ?? null, notas: notas ?? null,
    }).select('id').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    await adm.from('transferencia_items').insert(lineas.map((i: any) => ({
      transferencia_id: tr.id, producto_id: i.producto_id,
      cantidad_solicitada: Number(i.cantidad), cantidad_enviada: Number(i.cantidad),
      ubicacion: i.ubicacion === 'gondola' ? 'gondola' : 'deposito',
    })))
    return NextResponse.json({ ok: true, id: tr.id })
  }

  if (!b?.id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
  const { data: tr } = await adm.from('transferencias_sucursal').select('*').eq('id', b.id).maybeSingle<any>()
  if (!tr) return NextResponse.json({ error: 'transferencia no encontrada' }, { status: 404 })
  const { data: items } = await adm.from('transferencia_items').select('*').eq('transferencia_id', tr.id)

  // ───────── 2) SALE: confirma envío + foto → descuenta stock de origen ─────────
  if (accion === 'salida') {
    if (tr.estado !== 'pendiente_salida') return NextResponse.json({ error: 'la transferencia ya salió o no está pendiente' }, { status: 400 })
    for (const it of (items ?? []) as any[]) {
      await moverStock(adm, it.producto_id, tr.sucursal_origen_id, it.ubicacion === 'gondola' ? 'gondola' : 'deposito', -Number(it.cantidad_enviada))
      await adm.from('movimientos_stock').insert({
        producto_id: it.producto_id, sucursal_id: tr.sucursal_origen_id, tipo: 'transferencia_out',
        cantidad: -Number(it.cantidad_enviada), ubicacion: it.ubicacion === 'gondola' ? 'gondola' : 'deposito',
        motivo: 'Salida transferencia', referencia_tipo: 'transferencia', referencia_id: tr.id, created_by: g.userId,
      })
    }
    await adm.from('transferencias_sucursal').update({
      estado: 'en_transito', fecha_envio: new Date().toISOString(), salida_por: g.userId, foto_salida: b?.foto ?? null,
    }).eq('id', tr.id)
    return NextResponse.json({ ok: true })
  }

  // ───────── 3) SE RECIBE: confirma recepción + foto → suma stock a destino + diferencia ─────────
  if (accion === 'recepcion') {
    if (tr.estado !== 'en_transito') return NextResponse.json({ error: 'la transferencia no está en tránsito' }, { status: 400 })
    const recibidas: Record<string, number> = b?.recibidas ?? {}
    let hayDif = false
    for (const it of (items ?? []) as any[]) {
      const rec = recibidas[it.id] != null ? Number(recibidas[it.id]) : Number(it.cantidad_enviada)
      if (rec !== Number(it.cantidad_enviada)) hayDif = true
      await adm.from('transferencia_items').update({ cantidad_recibida: rec }).eq('id', it.id)
      await moverStock(adm, it.producto_id, tr.sucursal_destino_id, 'deposito', rec)
      await adm.from('movimientos_stock').insert({
        producto_id: it.producto_id, sucursal_id: tr.sucursal_destino_id, tipo: 'transferencia_in',
        cantidad: rec, ubicacion: 'deposito', motivo: hayDif ? 'Recepción transferencia (con diferencia)' : 'Recepción transferencia',
        referencia_tipo: 'transferencia', referencia_id: tr.id, created_by: g.userId,
      })
    }
    await adm.from('transferencias_sucursal').update({
      estado: 'completada', fecha_recepcion: new Date().toISOString(), recepcion_por: g.userId,
      foto_recepcion: b?.foto ?? null, diferencia_detectada: hayDif, notas: hayDif ? (b?.notas ?? 'Diferencia entre enviado y recibido') : tr.notas,
    }).eq('id', tr.id)

    // OS-3 · E: si hay diferencia, coser una TAREA de verificación al encargado destino.
    if (hayDif) {
      const detalle = ((items ?? []) as any[])
        .filter((it) => Number(it.cantidad_recibida) !== Number(it.cantidad_enviada))
        .map((it) => `• ${it.producto_id?.slice(0, 8) ?? 'item'}: envió ${it.cantidad_enviada}, recibió ${it.cantidad_recibida}`)
        .join('\n')
      // Supervisor de la sucursal destino (si hay); si no, queda al pool de la sucursal.
      const { data: sup } = await adm.from('supervisores_tareas').select('user_id').eq('sucursal_id', tr.sucursal_destino_id).eq('activo', true).limit(1).maybeSingle()
      const { data: tarea } = await adm.from('tareas').insert({
        titulo: 'Verificar diferencia en transferencia recibida',
        descripcion: `Recepción con diferencia enviado vs recibido:\n${detalle}\n\nRevisá las 3 fotos en el detalle de la transferencia y dejá la nota de qué pasó.`,
        tipo_origen: 'auto_sistema', prioridad: 'alta',
        estado: sup?.user_id ? 'asignada' : 'pendiente', responsable_id: sup?.user_id ?? null,
        asignacion_tipo: sup?.user_id ? 'usuario_especifico' : 'pool_sucursal',
        sucursal_id: tr.sucursal_destino_id, entidad_relacionada: 'transferencia', entidad_id: tr.id,
        entidad_url: `/admin/operaciones/transferencias/${tr.id}`, creado_por: g.userId,
      }).select('id').single()
      if (tarea?.id) await adm.from('transferencias_sucursal').update({ tarea_verificacion_id: tarea.id }).eq('id', tr.id)
    }
    return NextResponse.json({ ok: true, diferencia: hayDif })
  }

  if (accion === 'cancelar') {
    if (tr.estado !== 'pendiente_salida') return NextResponse.json({ error: 'solo se cancela antes de la salida' }, { status: 400 })
    await adm.from('transferencias_sucursal').update({ estado: 'cancelada' }).eq('id', tr.id)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'acción inválida' }, { status: 400 })
}
