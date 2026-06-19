import { NextResponse, type NextRequest } from 'next/server'

import { createAdminClient } from '@/lib/supabase/server'
import { isCronRequest } from '@/lib/cron/auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Resumen diario de NORA de lo importante de los chats (Comunicación · T8/innov.10).
 * Conecta con el auditor nocturno: arma un resumen y lo notifica a encargados.
 * También recalcula un score de clima simple por sucursal (innov. 11).
 */
export async function GET(req: NextRequest) {
  if (!isCronRequest(req)) return NextResponse.json({ error: 'sin_secret' }, { status: 401 })
  const adm = createAdminClient()
  const d1 = new Date(Date.now() - 86_400_000).toISOString()
  const periodo = new Date().toISOString().slice(0, 7)

  const [{ count: urgentes }, { count: comunicados }, { count: tareasChat }, { data: msgs }, { data: sucs }] = await Promise.all([
    adm.from('mensajes').select('id', { count: 'exact', head: true }).eq('es_urgente', true).gte('created_at', d1),
    adm.from('mensajes').select('id', { count: 'exact', head: true }).eq('tipo', 'comunicado').gte('created_at', d1),
    adm.from('tareas').select('id', { count: 'exact', head: true }).gte('created_at', d1).filter('datos_custom->>origen_mensaje_id', 'not.is', null),
    adm.from('mensajes').select('contenido, es_urgente, canal_id').gte('created_at', d1).limit(2000),
    adm.from('sucursales').select('id, nombre').eq('activa', true),
  ])

  const resumen = `Resumen del día: ${urgentes ?? 0} mensajes urgentes, ${comunicados ?? 0} comunicados, ${tareasChat ?? 0} tareas nacidas del chat.`

  // notificar a encargados
  const { data: enc } = await adm.from('users_admin').select('id').eq('activo', true).in('rol', ['super_admin', 'gerente'])
  if (enc?.length) await adm.from('notificaciones_admin').insert((enc as any[]).map((e) => ({ user_id: e.id, tipo: 'info', prioridad: 'media', titulo: '📋 Resumen diario de NORA', mensaje: resumen, url_accion: '/admin/comunicacion' })))

  // clima simple: señales de tensión = palabras negativas / urgentes por sucursal
  const NEG = /problema|error|mal|tarde|falta|queja|enojad|discut|otra vez|siempre/i
  const msgsArr = (msgs ?? []) as any[]
  for (const s of (sucs ?? []) as any[]) {
    const delCanal = msgsArr.filter((m) => true) // sin canal→sucursal directo; aproximación global por ahora
    const total = delCanal.length || 1
    const neg = delCanal.filter((m) => m.es_urgente || (m.contenido && NEG.test(m.contenido))).length
    const score = Math.max(0, Math.round((10 - (neg / total) * 10) * 10) / 10)
    await adm.from('clima_chats').upsert({ sucursal_id: s.id, periodo, score_clima: score, senales: { negativos: neg, total }, updated_at: new Date().toISOString() }, { onConflict: 'sucursal_id,periodo' })
  }

  return NextResponse.json({ ok: true, resumen })
}
