import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { ejecutar } from '@/lib/agentes/ejecutor'
import { agentePorId, type Nivel } from '@/lib/agentes/elenco'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * A · QUE EL AGENTE HAGA.
 *
 * ── UN AGENTE NUNCA TIENE MÁS PERMISOS QUE QUIEN LO CORRE ───────────────────
 *
 * El ejecutor corre con el cliente de servicio —necesita escribir en tablas que
 * el usuario no toca directo— y eso haría que un cajero pudiera disparar algo
 * que no puede hacer a mano. Por eso acá se verifica ANTES el permiso del
 * módulo del agente con la sesión de quien pide.
 *
 * Es el quinto límite del modelo, y es el que se rompe solo si no se escribe.
 */
export async function POST(req: NextRequest) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no autenticado' }, { status: 401 })

  const { data: me } = await sb.from('users_admin')
    .select('rol, activo, sucursal_id').eq('id', user.id)
    .maybeSingle<{ rol: string; activo: boolean; sucursal_id: string | null }>()
  if (!me?.activo) return NextResponse.json({ error: 'usuario inactivo' }, { status: 403 })

  const b = await req.json().catch(() => null)
  const agenteId = typeof b?.agente === 'string' ? b.agente : null
  const accion = typeof b?.accion === 'string' ? b.accion : null
  if (!agenteId || !accion) return NextResponse.json({ error: 'falta el agente o la acción' }, { status: 400 })

  const agente = agentePorId(agenteId)
  if (!agente) return NextResponse.json({ error: 'ese agente no existe' }, { status: 404 })

  // El alcance: un agente por sucursal actúa sobre la del usuario; uno de
  // cadena, sobre la cadena. No se toma del cuerpo.
  const sucursalId = agente.alcance === 'sucursal' ? me.sucursal_id : null

  // El permiso de quien dispara. El agente lee de un módulo; si el usuario no
  // puede ver ese módulo, el agente tampoco puede actuar en su nombre.
  const moduloDe: Record<string, string> = {
    abasto: 'compras', tesoro: 'finanzas', reparto: 'operaciones',
    margen: 'ofertas', despacho: 'pedidos', vigia: 'operaciones', documentos: 'compras',
  }
  const { data: puede } = await sb.rpc('hub_puede', {
    p_modulo: moduloDe[agenteId] ?? 'configuracion', p_accion: 'editar',
  })
  if (puede !== true) {
    return NextResponse.json({
      error: `No podés hacer esto a mano, así que ${agente.nombre} tampoco lo puede hacer por vos.`,
    }, { status: 403 })
  }

  const adm = createAdminClient()

  const { data: cfg } = await adm.from('agente_config')
    .select('nivel, limite_monto')
    .eq('agente', agenteId).eq('accion', accion)
    .is('sucursal_id', sucursalId === null ? null : undefined)
    .maybeSingle<{ nivel: Nivel; limite_monto: number | null }>()

  const { data: cfgSuc } = sucursalId
    ? await adm.from('agente_config').select('nivel, limite_monto')
        .eq('agente', agenteId).eq('accion', accion).eq('sucursal_id', sucursalId)
        .maybeSingle<{ nivel: Nivel; limite_monto: number | null }>()
    : { data: null }

  const elegida = cfgSuc ?? cfg
  // B.6 de la v0.98: arrancan hablando. Sin configurar, «sugiere».
  const nivel: Nivel = elegida?.nivel ?? 'sugiere'

  const r = await ejecutar({
    adm, agenteId, accion, sucursalId, userId: user.id,
    nivel, limiteMonto: elegida?.limite_monto ?? null,
  })

  // A.5 · TODO lo que ejecuta un agente va a la bitácora, incluso lo que falló.
  const { data: fila } = await adm.from('agente_bitacora').insert({
    agente: agenteId,
    accion,
    sucursal_id: sucursalId,
    propuso: r.texto,
    por_que: r.degradado ?? null,
    estado: r.ok ? (r.nivelAplicado === 'hace_y_avisa' ? 'ejecutada' : 'propuesta') : 'rechazada',
    decidio: r.nivelAplicado === 'hace_y_avisa' ? user.id : null,
    decidio_at: r.nivelAplicado === 'hace_y_avisa' ? new Date().toISOString() : null,
    decidio_que: r.nivelAplicado,
    // El número de partida va junto con la entidad: sin él, el medidor no
    // puede juzgar esta propuesta dentro de 30 días y lo va a decir.
    esperado: (r.esperado || r.entidad)
      ? { ...(r.esperado ?? {}), ...(r.entidad ? { entidad: r.entidad } : {}), nivel: r.nivelAplicado }
      : null,
    resultado: r.error ? { error: r.error } : null,
  }).select('id').maybeSingle()

  return NextResponse.json({
    ok: r.ok, texto: r.texto, nivel: r.nivelAplicado, degradado: r.degradado ?? null,
    error: r.error ?? null, entidad: r.entidad ?? null, bitacora_id: fila?.id ?? null,
  })
}

/**
 * A.5 · DESHACER, mientras sea reversible.
 *
 * Borra lo que el agente creó y la fila de la bitácora. Sólo lo que está en
 * borrador o solicitada: una orden ya enviada o una transferencia en tránsito
 * no se deshacen desde acá — eso ya salió del sistema.
 */
export async function DELETE(req: NextRequest) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no autenticado' }, { status: 401 })

  const b = await req.json().catch(() => null)
  const id = typeof b?.bitacora_id === 'string' ? b.bitacora_id : null
  if (!id) return NextResponse.json({ error: 'falta la referencia' }, { status: 400 })

  const adm = createAdminClient()
  const { data: fila } = await adm.from('agente_bitacora')
    .select('id, esperado').eq('id', id).maybeSingle<{ id: string; esperado: any }>()
  if (!fila) return NextResponse.json({ error: 'eso no existe' }, { status: 404 })

  const ent = fila.esperado?.entidad as { tabla: string; id: string } | undefined
  if (ent) {
    const REVERSIBLE: Record<string, { col: string; estados: string[] }> = {
      ordenes_compra: { col: 'estado', estados: ['borrador'] },
      transferencias_sucursal: { col: 'estado', estados: ['solicitada'] },
      ofertas: { col: 'estado', estados: ['borrador'] },
    }
    const regla = REVERSIBLE[ent.tabla]
    if (!regla) return NextResponse.json({ error: 'eso ya no se puede deshacer desde acá' }, { status: 409 })

    const { data: actual } = await adm.from(ent.tabla).select(regla.col).eq('id', ent.id).maybeSingle()
    const estado = (actual as any)?.[regla.col]
    if (estado && !regla.estados.includes(estado)) {
      return NextResponse.json({
        error: `Ya no se puede deshacer: pasó a «${estado}». Eso ya salió del sistema.`,
      }, { status: 409 })
    }
    await adm.from(ent.tabla).delete().eq('id', ent.id)
  }

  await adm.from('agente_bitacora').delete().eq('id', id)
  return NextResponse.json({ ok: true })
}
