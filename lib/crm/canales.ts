/**
 * Envío de campañas por canal (CRM · v0.29).
 *  - push    → inserta en `notifications` de la cuponera (broadcast al Club, GRATIS).
 *  - email   → Resend (lib/email). Sin API key → queda 'encolado'.
 *  - whatsapp→ SIEMPRE 'encolado' (envío real requiere WhatsApp Business API · F19).
 * Registra cada destinatario en `campania_envios` y actualiza métricas.
 */
import { evaluarSegmento } from '@/lib/crm/segmentos'
import { sendEmail, hasEmailConfig } from '@/lib/email/resend'
import type { CampaniaMensaje, SegmentoRegla } from '@/lib/types/crm'

type Adm = any

export type ResultadoEnvio = {
  destinatarios: number
  push: number
  email_enviados: number
  email_encolados: number
  whatsapp_encolados: number
}

export async function enviarCampania(adm: Adm, campaniaId: string): Promise<ResultadoEnvio> {
  const { data: camp } = await adm.from('campanias_crm').select('*').eq('id', campaniaId).maybeSingle()
  if (!camp) throw new Error('campaña inexistente')

  // resolver destinatarios del segmento
  let regla: SegmentoRegla = {}
  if (camp.segmento_id) {
    const { data: seg } = await adm.from('segmentos').select('regla').eq('id', camp.segmento_id).maybeSingle()
    regla = (seg?.regla ?? {}) as SegmentoRegla
  }
  const { ids } = await evaluarSegmento(adm, regla, { esTodas: true })
  const { data: clientes } = await adm.from('clientes').select('id, email, cuponera_user_id, es_demo').in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
  const lista = (clientes ?? []) as any[]

  const mensaje = (camp.mensaje ?? {}) as CampaniaMensaje
  const canales: string[] = camp.canales ?? []
  const envios: any[] = []
  const res: ResultadoEnvio = { destinatarios: lista.length, push: 0, email_enviados: 0, email_encolados: 0, whatsapp_encolados: 0 }

  // ---- PUSH (broadcast al Club vía notifications) ----
  if (canales.includes('push') && mensaje.push) {
    await adm.from('notifications').insert({
      title: mensaje.push.title ?? camp.nombre, body: mensaje.push.body ?? '', type: 'campaign',
      related_coupon_id: camp.cupon_ref ?? null, sent_at: new Date().toISOString(),
      sent_count: lista.filter((c) => c.cuponera_user_id).length,
    })
    for (const c of lista) {
      if (!c.cuponera_user_id) continue
      envios.push({ campania_id: campaniaId, cliente_id: c.id, canal: 'push', estado: 'enviado', enviado_at: new Date().toISOString(), es_demo: c.es_demo })
      res.push++
    }
  }

  // ---- EMAIL (Resend; sin key → encolado) ----
  if (canales.includes('email') && mensaje.email) {
    const hayKey = hasEmailConfig()
    let enviados = 0
    for (const c of lista) {
      if (!c.email) continue
      let estado: 'enviado' | 'encolado' | 'error' = 'encolado'
      let error: string | null = null
      if (hayKey && enviados < 300) {
        const r = await sendEmail(c.email, mensaje.email.subject ?? camp.nombre, { html: mensaje.email.html })
        if (r.ok) { estado = 'enviado'; enviados++ } else if (r.skipped) { estado = 'encolado' } else { estado = 'error'; error = r.error ?? null }
      }
      envios.push({ campania_id: campaniaId, cliente_id: c.id, canal: 'email', estado, error, enviado_at: estado === 'enviado' ? new Date().toISOString() : null, es_demo: c.es_demo })
      if (estado === 'enviado') res.email_enviados++; else if (estado === 'encolado') res.email_encolados++
    }
  }

  // ---- WHATSAPP (siempre encolado, F19) ----
  if (canales.includes('whatsapp') && mensaje.whatsapp) {
    for (const c of lista) {
      envios.push({ campania_id: campaniaId, cliente_id: c.id, canal: 'whatsapp', estado: 'encolado', es_demo: c.es_demo })
      res.whatsapp_encolados++
    }
  }

  if (envios.length) await adm.from('campania_envios').insert(envios)

  const enviadosTotal = res.push + res.email_enviados + res.email_encolados + res.whatsapp_encolados
  await adm.from('campanias_crm').update({
    estado: 'enviada',
    metricas: { ...(camp.metricas ?? {}), enviados: enviadosTotal, destinatarios: lista.length },
  }).eq('id', campaniaId)

  return res
}
