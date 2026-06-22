/**
 * NORA redacta el mensaje de cada campaña según objetivo + segmento (CRM · v0.29).
 * Usa Anthropic si hay API key; si no, plantillas robustas (siempre funciona).
 * Adapta longitud por canal (push corto, email largo, whatsapp medio).
 */
import { getAnthropic, hasAnthropicKey } from '@/lib/ai/client'
import { CHAT_MODEL } from '@/lib/ai/config'
import type { CampaniaMensaje } from '@/lib/types/crm'

export type Variante = 'normal' | 'corto' | 'otra'

type Plantilla = { push: { title: string; body: string }; whatsapp: string; emailSubject: string; emailBody: string }

const MARCA = 'Social Ahorro'

const PLANTILLAS: Record<string, Plantilla[]> = {
  reactivar: [
    { push: { title: '¡Te extrañamos! 💚', body: 'Hace rato que no te vemos. Volvé con un beneficio especial.' },
      whatsapp: 'Hola! En Social Ahorro te extrañamos 💚 Hace un tiempo que no pasás. Tenemos un beneficio esperándote, ¿te lo guardo?',
      emailSubject: 'Te extrañamos en Social Ahorro 💚', emailBody: 'Hace un tiempo que no te vemos por la farmacia. Preparamos un beneficio para tu próxima compra. ¡Te esperamos!' },
    { push: { title: 'Volvé y ahorrá 🛒', body: 'Tenemos una sorpresa para vos en tu próxima compra.' },
      whatsapp: '¡Hola! Queremos que vuelvas a Social Ahorro. Pasá esta semana y aprovechá un descuento especial 🛒',
      emailSubject: 'Una sorpresa para tu vuelta', emailBody: 'Notamos que hace rato no comprás con nosotros. Volvé esta semana y te damos un descuento especial.' },
  ],
  fidelizar: [
    { push: { title: 'Gracias por elegirnos 💚', body: 'Sos parte de Social Ahorro. Tenemos un regalo para vos.' },
      whatsapp: '¡Gracias por ser cliente de Social Ahorro! Como agradecimiento, te dejamos un beneficio exclusivo 💚',
      emailSubject: 'Gracias por ser parte 💚', emailBody: 'Tu fidelidad es lo más importante. Por eso preparamos un beneficio exclusivo para vos.' },
  ],
  promo: [
    { push: { title: 'Oferta del mes 🔥', body: 'Aprovechá los precios especiales de esta semana.' },
      whatsapp: '🔥 Llegaron las ofertas del mes a Social Ahorro. Precios especiales por tiempo limitado, ¡no te las pierdas!',
      emailSubject: 'Ofertas que no te podés perder 🔥', emailBody: 'Esta semana tenemos precios especiales en productos seleccionados. Aprovechá antes de que se terminen.' },
  ],
  cumpleanos: [
    { push: { title: '¡Feliz cumple! 🎂', body: 'Te regalamos un beneficio para festejar tu día.' },
      whatsapp: '🎂 ¡Feliz cumpleaños de parte de todo Social Ahorro! Te dejamos un regalito para tu día. Pasá a buscarlo 🎁',
      emailSubject: '¡Feliz cumpleaños! 🎂', emailBody: 'En tu día queremos saludarte y regalarte un beneficio especial. ¡Que lo disfrutes!' },
  ],
  recompra: [
    { push: { title: '¿Se te está acabando? 💊', body: 'Reponé tu medicación antes de quedarte sin stock.' },
      whatsapp: 'Hola! Según tu última compra, podría estarse acabando tu medicación 💊 Pasá a reponerla así no te quedás sin. ¿Te la preparo?',
      emailSubject: 'Hora de reponer tu medicación 💊', emailBody: 'Calculamos que tu medicación está por terminarse. Pasá a reponerla o pedila online para no quedarte sin stock.' },
  ],
}

function acortar(s: string, n: number): string { return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…' }

/** Plantilla por objetivo + variante (fallback sin IA). */
export function redactarPlantilla(objetivo: string, canales: string[], variante: Variante = 'normal', segmentoNombre?: string): CampaniaMensaje {
  const set = PLANTILLAS[objetivo] ?? PLANTILLAS.promo
  const idx = variante === 'otra' && set.length > 1 ? 1 : 0
  const p = set[idx]
  const corto = variante === 'corto'
  const msg: CampaniaMensaje = {}
  if (canales.includes('push')) msg.push = { title: p.push.title, body: corto ? acortar(p.push.body, 60) : p.push.body }
  if (canales.includes('whatsapp')) msg.whatsapp = { body: corto ? acortar(p.whatsapp, 120) : p.whatsapp }
  if (canales.includes('email')) {
    const cuerpo = corto ? acortar(p.emailBody, 140) : p.emailBody
    msg.email = { subject: p.emailSubject, html: emailHtml(p.emailSubject, cuerpo, segmentoNombre) }
  }
  return msg
}

/** HTML de email con identidad NORA (violeta + menta). */
export function emailHtml(titulo: string, cuerpo: string, segmento?: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f5f3fb;font-family:system-ui,Segoe UI,Arial,sans-serif">
  <div style="max-width:520px;margin:0 auto;padding:24px">
    <div style="background:#6E3CDB;border-radius:16px 16px 0 0;padding:20px 24px">
      <div style="color:#fff;font-weight:700;font-size:18px">${MARCA}</div>
      <div style="color:#2EE1A8;font-size:12px">Tu farmacia de confianza</div>
    </div>
    <div style="background:#fff;border-radius:0 0 16px 16px;padding:24px">
      <h1 style="margin:0 0 12px;font-size:20px;color:#1a1530">${titulo}</h1>
      <p style="margin:0 0 16px;color:#444;line-height:1.5">${cuerpo}</p>
      <a href="https://socialahorro.com" style="display:inline-block;background:#6E3CDB;color:#fff;text-decoration:none;padding:10px 20px;border-radius:10px;font-weight:600">Ver más</a>
      <p style="margin:20px 0 0;color:#999;font-size:11px">${segmento ? `Recibís esto porque sos parte de "${segmento}". ` : ''}Social Ahorro · Si no querés recibir más, respondé BAJA.</p>
    </div>
  </div></body></html>`
}

/** Redacta con NORA (IA si hay key; si no, plantilla). */
export async function redactarCampania(
  opts: { objetivo: string; canales: string[]; segmentoNombre?: string; variante?: Variante },
): Promise<{ mensaje: CampaniaMensaje; via: 'ia' | 'plantilla' }> {
  const variante = opts.variante ?? 'normal'
  if (!hasAnthropicKey()) return { mensaje: redactarPlantilla(opts.objetivo, opts.canales, variante, opts.segmentoNombre), via: 'plantilla' }

  try {
    const sys = `Sos NORA, asistente de marketing de la farmacia ${MARCA} (Argentina, tono cercano y profesional, voseo). Redactás mensajes de campaña para clientes. Devolvé SOLO JSON válido.`
    const longitud = variante === 'corto' ? 'Mensajes MÁS CORTOS de lo normal.' : variante === 'otra' ? 'Dame una versión ALTERNATIVA, distinta a la típica.' : ''
    const user = `Objetivo: ${opts.objetivo}. Segmento: ${opts.segmentoNombre ?? 'clientes'}. Canales: ${opts.canales.join(', ')}. ${longitud}
Devolvé JSON: {"push":{"title":"≤40 chars","body":"≤90 chars"},"whatsapp":{"body":"≤220 chars, con emoji"},"email":{"subject":"≤60 chars","body":"2-3 frases"}}. Solo incluí los canales pedidos.`
    const r = await getAnthropic().messages.create({ model: CHAT_MODEL, max_tokens: 700, system: sys, messages: [{ role: 'user', content: user }] })
    const txt = r.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('')
    const json = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1))
    const msg: CampaniaMensaje = {}
    if (opts.canales.includes('push') && json.push) msg.push = { title: json.push.title, body: json.push.body }
    if (opts.canales.includes('whatsapp') && json.whatsapp) msg.whatsapp = { body: json.whatsapp.body }
    if (opts.canales.includes('email') && json.email) msg.email = { subject: json.email.subject, html: emailHtml(json.email.subject, json.email.body, opts.segmentoNombre) }
    if (!Object.keys(msg).length) throw new Error('vacío')
    return { mensaje: msg, via: 'ia' }
  } catch {
    return { mensaje: redactarPlantilla(opts.objetivo, opts.canales, variante, opts.segmentoNombre), via: 'plantilla' }
  }
}
