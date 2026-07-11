import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getSucursalActiva } from '@/lib/sucursal/server'
import { getAnthropic, hasAnthropicKey } from '@/lib/ai/client'
import { herramientasParaUsuario, resolverSlots, toolDefs, systemPrompt, type NoraCtx, type Herramienta, type PasoSlot } from '@/lib/nora/herramientas'
import type { AdminRole } from '@/lib/types/admin'
import type { PermisosCustom } from '@/lib/types/permisos'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MODELO = 'claude-haiku-4-5'
const DEGRADADO = 'Ahora mismo no puedo ejecutar acciones por chat (falta la conexión con la IA). Podés hacerlo a mano desde el botón +.'

/**
 * NORA Acciones — orquestador conversacional (N-01..N-07). Claude (haiku) hace
 * NLU; el slot-filling, la confirmación y la ejecución son deterministas y
 * server-side, reusando los endpoints reales. Respuestas estructuradas para el
 * front: texto | opciones (chips) | confirmacion (card) | resultado | error.
 */
export async function POST(req: NextRequest) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ tipo: 'error', texto: 'Iniciá sesión para hablar con NORA.' }, { status: 401 })
  const { data: me } = await sb.from('users_admin').select('rol, activo, permisos_custom').eq('id', user.id).maybeSingle<{ rol: AdminRole; activo: boolean; permisos_custom: PermisosCustom | null }>()
  if (!me?.activo) return NextResponse.json({ tipo: 'error', texto: 'Tu usuario no está activo.' }, { status: 403 })
  const nombre = ((user.user_metadata as Record<string, any> | null)?.nombre as string) ?? null

  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ tipo: 'error', texto: 'No pude leer el mensaje.' }, { status: 400 }) }

  const { sucursalId, esTodas } = getSucursalActiva()
  const ctx: NoraCtx = { userId: user.id, rol: me.rol, permisosCustom: me.permisos_custom ?? null, sucursalId, esTodas }
  const herrs = herramientasParaUsuario(me.rol, me.permisos_custom ?? null)
  const adm = createAdminClient()

  async function guardar(cid: string | null, entidad?: string | null): Promise<string | null> {
    try {
      const mensajes = Array.isArray(b?.historial) ? b.historial.slice(-40) : []
      if (cid) {
        const patch: any = { mensajes }
        if (entidad) {
          const { data: prev } = await sb.from('nora_conversaciones').select('entidades_creadas').eq('id', cid).maybeSingle<any>()
          patch.entidades_creadas = [...new Set([...(prev?.entidades_creadas ?? []), entidad])]
        }
        await sb.from('nora_conversaciones').update(patch).eq('id', cid)
        return cid
      }
      const { data } = await sb.from('nora_conversaciones').insert({ user_id: user.id, subapp: b?.subapp ?? 'finanzas', mensajes, entidades_creadas: entidad ? [entidad] : [] }).select('id').maybeSingle<{ id: string }>()
      return data?.id ?? null
    } catch { return cid }
  }

  const respPaso = async (h: Herramienta, paso: PasoSlot, cid: string | null) => {
    if (paso.estado === 'completo') {
      const conf = h.armarConfirmacion ? await h.armarConfirmacion(adm, paso.valores, ctx) : { titulo: 'Confirmá', campos: [], advertencias: [] }
      return NextResponse.json({ tipo: 'confirmacion', herramienta_id: h.id, valores: paso.valores, confirmacion: conf, conversacion_id: cid })
    }
    if (paso.estado === 'sin_opciones') return NextResponse.json({ tipo: 'texto', texto: paso.texto, conversacion_id: cid })
    return NextResponse.json({ tipo: 'opciones', herramienta_id: h.id, slot: paso.slot, slot_tipo: paso.tipo, descripcion: paso.descripcion, opciones: paso.opciones ?? [], nota: paso.nota, valores: paso.valores, conversacion_id: cid })
  }

  // ── chip tocado / slot completado → merge determinista (sin modelo) ──
  if (b?.accion === 'slot') {
    const h = herrs.find((x) => x.id === b.herramienta_id)
    if (!h) return NextResponse.json({ tipo: 'texto', texto: 'Esa acción no está disponible para vos.' })
    const valores = { ...(b.valores ?? {}), [b.slot]: b.valor }
    return respPaso(h, await resolverSlots(adm, h, valores, ctx), b.conversacion_id ?? null)
  }

  // ── confirmar → ejecutar (revalida permiso + saldos server-side) ──
  if (b?.accion === 'confirmar') {
    const h = herrs.find((x) => x.id === b.herramienta_id)
    if (!h || !h.ejecutar) return NextResponse.json({ tipo: 'error', texto: 'No tenés permiso para ejecutar esta acción.' })
    const r = await h.ejecutar(adm, b.valores ?? {}, ctx)
    if (!r.ok) return NextResponse.json({ tipo: 'error', texto: r.error ?? 'No se pudo ejecutar.' })
    const cid = await guardar(b.conversacion_id ?? null, r.entidad_id ?? null)
    return NextResponse.json({ tipo: 'resultado', texto: r.texto, entidad_id: r.entidad_id ?? null, conversacion_id: cid })
  }

  if (b?.accion === 'corregir') {
    return NextResponse.json({ tipo: 'texto', texto: 'Dale, contame qué querés cambiar y lo ajusto.', herramienta_id: b.herramienta_id, valores: b.valores ?? {}, conversacion_id: b.conversacion_id ?? null })
  }

  // ── texto libre → NLU con Claude ──
  const mensaje = String(b?.mensaje ?? '').trim()
  if (!mensaje) return NextResponse.json({ tipo: 'texto', texto: 'Contame qué necesitás.' })
  if (!hasAnthropicKey()) return NextResponse.json({ tipo: 'texto', texto: DEGRADADO, degradado: true })

  try {
    const historial = (Array.isArray(b?.historial) ? b.historial : []).filter((m: any) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim()).slice(-12)
    let sys = systemPrompt(nombre, me.rol, herrs, b?.subapp ?? null)
    if (b?.herramienta_id) sys += `\n\nCONTEXTO: estás completando "${b.herramienta_id}" con estos datos ya cargados: ${JSON.stringify(b.valores ?? {})}. Extraé lo nuevo del mensaje y llamá esa herramienta con los datos actualizados.`

    const anthropic = getAnthropic()
    const resp: any = await anthropic.messages.create({
      model: MODELO, max_tokens: 1024, system: sys,
      tools: toolDefs(herrs) as any,
      messages: [...historial.map((m: any) => ({ role: m.role, content: m.content })), { role: 'user', content: mensaje }],
    })

    const toolUse = (resp.content ?? []).find((x: any) => x.type === 'tool_use')
    const cid = await guardar(b?.conversacion_id ?? null)
    if (!toolUse) {
      const texto = (resp.content ?? []).filter((x: any) => x.type === 'text').map((x: any) => x.text).join('').trim()
      return NextResponse.json({ tipo: 'texto', texto: texto || 'Contame qué necesitás y lo hacemos.', conversacion_id: cid })
    }
    const h = herrs.find((x) => x.id === toolUse.name)
    if (!h) return NextResponse.json({ tipo: 'texto', texto: 'Eso no lo puedo hacer con tus permisos. Si querés, decime otra cosa.', conversacion_id: cid })

    const input = Object.fromEntries(Object.entries(toolUse.input ?? {}).filter(([, v]) => v != null && String(v).trim() !== ''))
    const valores = { ...(b?.valores ?? {}), ...input }
    const paso = await resolverSlots(adm, h, valores, ctx)
    if (h.soloLectura && paso.estado === 'completo' && h.responder) {
      const rr = await h.responder(adm, paso.valores, ctx)
      return NextResponse.json({ tipo: 'texto', texto: rr.texto, conversacion_id: cid })
    }
    return respPaso(h, paso, cid)
  } catch (e: any) {
    return NextResponse.json({ tipo: 'texto', texto: 'Tuve un problema para procesar eso. Probá de nuevo o usá el botón +.', degradado: true })
  }
}
