import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { puede, type PermisosCustom } from '@/lib/types/permisos'
import type { AdminRole } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * B · LA PRESENTACIÓN · ESCRITURA.
 *
 * ── LO QUE VERIFICA ESTA RUTA ANTES DE ESCRIBIR ─────────────────────────────
 *
 * Que quien llama tenga el permiso **y la sucursal**. Escribe con el cliente
 * de servicio porque tiene que crear la tarea de control, y crear tareas no es
 * algo que la RLS de `tareas` le permita a un encargado desde su sesión.
 *
 * Eso significa que esta ruta es la guardia, así que la sucursal se verifica
 * acá y no se confía en el cuerpo. Un encargado que manda otro `sucursal_id`
 * recibe 403.
 *
 * ── Y LO QUE NO ACEPTA ──────────────────────────────────────────────────────
 *
 * Paciente, médico, diagnóstico. No hay columna donde ponerlos.
 */

type Gate =
  | { error: string; status: 401 | 403 }
  | { ok: true; userId: string; rol: AdminRole; custom: PermisosCustom | null; sucursalId: string | null }

async function gate(accion: 'crear' | 'editar' | 'eliminar'): Promise<Gate> {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: 'no autenticado', status: 401 }

  const { data: me } = await sb.from('users_admin')
    .select('rol, activo, permisos_custom, sucursal_id').eq('id', user.id)
    .maybeSingle<{ rol: AdminRole; activo: boolean; permisos_custom: PermisosCustom | null; sucursal_id: string | null }>()
  if (!me?.activo) return { error: 'usuario inactivo', status: 403 }
  if (!puede(me.rol, me.permisos_custom ?? null, 'convenios', accion)) {
    return { error: `sin permiso para ${accion} presentaciones`, status: 403 }
  }
  return { ok: true, userId: user.id, rol: me.rol, custom: me.permisos_custom ?? null, sucursalId: me.sucursal_id }
}

/**
 * Quien tiene una sucursal asignada sólo opera sobre la suya. Regla de oro 8 y
 * F.2: un encargado ve y arma lo de su sucursal.
 */
function sucursalPermitida(g: Extract<Gate, { ok: true }>, pedida: string | null): string | null {
  if (!pedida) return g.sucursalId
  if (g.sucursalId && g.sucursalId !== pedida) return null
  return pedida
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null)
  const accion = String(b?.accion ?? '')
  const g = await gate(accion === 'crear' ? 'crear' : 'editar')
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })

  const adm = createAdminClient()

  // ── ARMAR LA PRESENTACIÓN ───────────────────────────────────────────────
  if (accion === 'crear') {
    const suc = sucursalPermitida(g, b?.sucursal_id ?? null)
    if (!suc) {
      return NextResponse.json({
        error: 'La sucursal es obligatoria y tiene que ser la tuya. Una presentación sin sucursal no se puede atribuir, y un débito sin sucursal tampoco.',
      }, { status: 403 })
    }
    if (!b?.convenio_id || !b?.periodo_desde || !b?.periodo_hasta) {
      return NextResponse.json({ error: 'falta el convenio o el período' }, { status: 400 })
    }

    const { data, error } = await adm.from('convenio_presentaciones').insert({
      convenio_id: b.convenio_id, sucursal_id: suc,
      periodo_desde: b.periodo_desde, periodo_hasta: b.periodo_hasta,
      estado: 'borrador', armada_por: g.userId, armada_at: new Date().toISOString(),
      created_by: g.userId, notas: b?.notas ?? null,
    }).select('id').maybeSingle()

    if (error) {
      return NextResponse.json({
        error: /duplicate|unique/i.test(error.message)
          ? 'Ya hay una presentación de ese convenio, esa sucursal y ese período. Dos presentaciones del mismo período es plata contada dos veces.'
          : error.message,
      }, { status: 400 })
    }
    return NextResponse.json({ ok: true, id: data?.id })
  }

  // ── METER / SACAR COMPROBANTES ──────────────────────────────────────────
  if (accion === 'incluir' || accion === 'excluir') {
    const ids: string[] = Array.isArray(b?.comprobante_ids) ? b.comprobante_ids : []
    if (!ids.length) return NextResponse.json({ error: 'no mandaste comprobantes' }, { status: 400 })

    // La sucursal se verifica contra los comprobantes, no contra el cuerpo.
    const { data: comps } = await adm.from('convenio_comprobantes')
      .select('id, sucursal_id').in('id', ids)
    const ajenos = (comps ?? []).filter((c: any) => g.sucursalId && c.sucursal_id !== g.sucursalId)
    if (ajenos.length) {
      return NextResponse.json({ error: 'hay comprobantes de otra sucursal en el pedido' }, { status: 403 })
    }

    if (accion === 'incluir') {
      const { data: pres } = await adm.from('convenio_presentaciones')
        .select('id, estado, sucursal_id').eq('id', b?.presentacion_id).maybeSingle()
      if (!pres) return NextResponse.json({ error: 'la presentación no existe' }, { status: 404 })
      if (!['borrador', 'armada'].includes((pres as any).estado)) {
        return NextResponse.json({
          error: 'esta presentación ya se envió: no se le agregan comprobantes. Lo que falta va en la siguiente.',
        }, { status: 409 })
      }
      const { error } = await adm.from('convenio_comprobantes')
        .update({ presentacion_id: b.presentacion_id, estado: 'en_presentacion', motivo_exclusion: null, exclusion_detalle: null })
        .in('id', ids)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      await adm.rpc('convenio_presentacion_recalcular', { p_presentacion: b.presentacion_id })
      return NextResponse.json({ ok: true, movidos: ids.length })
    }

    // B.3 · sacar NO es borrar. El comprobante queda, con su motivo.
    if (!b?.motivo) {
      return NextResponse.json({
        error: 'un comprobante que queda afuera tiene que decir por qué. Sin motivo es una fila que desapareció sin explicación.',
      }, { status: 400 })
    }
    const pres = b?.presentacion_id ?? null
    const { error } = await adm.from('convenio_comprobantes').update({
      presentacion_id: null, estado: 'excluido',
      motivo_exclusion: b.motivo, exclusion_detalle: b?.detalle ?? null,
    }).in('id', ids)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    if (pres) await adm.rpc('convenio_presentacion_recalcular', { p_presentacion: pres })
    return NextResponse.json({ ok: true, excluidos: ids.length })
  }

  // ── ENVIAR (y generar la tarea de control) ──────────────────────────────
  if (accion === 'enviar') {
    const { data: pres } = await adm.from('convenio_presentaciones')
      .select('sucursal_id').eq('id', b?.presentacion_id).maybeSingle()
    if (!pres) return NextResponse.json({ error: 'la presentación no existe' }, { status: 404 })
    if (g.sucursalId && (pres as any).sucursal_id !== g.sucursalId) {
      return NextResponse.json({ error: 'esa presentación es de otra sucursal' }, { status: 403 })
    }

    const { data, error } = await adm.rpc('convenio_presentacion_enviar', {
      p_presentacion: b.presentacion_id,
      p_fecha_envio: b?.fecha_envio ?? null,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    const r = data as any
    // La función devuelve el motivo en vez de lanzar: así el rechazo llega con
    // la explicación y no como un error de base de datos.
    if (!r?.ok) return NextResponse.json({ error: r?.motivo ?? 'no se pudo enviar' }, { status: 409 })
    return NextResponse.json(r)
  }

  // ── REVISAR (segunda persona) ───────────────────────────────────────────
  if (accion === 'revisar') {
    const { error } = await adm.from('convenio_presentaciones').update({
      estado: 'armada', revisada_por: g.userId, revisada_at: new Date().toISOString(),
    }).eq('id', b?.presentacion_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: `acción desconocida: ${accion}` }, { status: 400 })
}
