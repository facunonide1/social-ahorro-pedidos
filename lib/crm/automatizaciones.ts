/**
 * Motor de automatizaciones del CRM (v0.29). Evalúa los triggers y genera los
 * envíos (push/email ya; whatsapp encolado · F19). Lo corre el cron diario
 * `correr-automatizaciones`. Usa ventanas estrechas (banda de 1 día) para no
 * re-disparar al mismo cliente todos los días.
 */
import { sendEmail, hasEmailConfig } from '@/lib/email/resend'
import { redactarPlantilla } from '@/lib/crm/nora-redactar'
import type { MensajeCanal } from '@/lib/types/crm'

type Adm = any
const hoyISO = () => new Date().toISOString().slice(0, 10)
const isoMenos = (d: number) => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10)

/** Clientes objetivo de una automatización (banda estrecha = no spamear). */
async function objetivo(adm: Adm, auto: any): Promise<any[]> {
  const cfg = auto.config ?? {}
  if (auto.trigger === 'cumpleanos') {
    const { data } = await adm.from('clientes').select('id, nombre, email, cuponera_user_id, fecha_nacimiento, es_demo').eq('activo', true).not('fecha_nacimiento', 'is', null).limit(5000)
    const hoy = new Date()
    return ((data ?? []) as any[]).filter((c) => { const f = new Date(c.fecha_nacimiento + 'T00:00:00'); return f.getMonth() === hoy.getMonth() && f.getDate() === hoy.getDate() })
  }
  if (auto.trigger === 'inactividad_30d') {
    const dias = Number(cfg.dias_inactividad ?? 30)
    // banda: cruzaron el umbral justo hoy (entre dias y dias+1)
    const { data } = await adm.from('clientes').select('id, nombre, email, cuponera_user_id, es_demo')
      .eq('activo', true).gte('ultima_compra', isoMenos(dias + 1)).lte('ultima_compra', isoMenos(dias)).limit(5000)
    return (data ?? []) as any[]
  }
  if (auto.trigger === 'recompra_cronico') {
    const antes = Number(cfg.dias_antes_recompra ?? 5)
    // ultima_compra + frecuencia - antes == hoy  →  ultima_compra == hoy - (frecuencia - antes)
    const { data } = await adm.from('clientes').select('id, nombre, email, cuponera_user_id, ultima_compra, frecuencia_compra_dias, es_demo')
      .eq('activo', true).not('frecuencia_compra_dias', 'is', null).not('ultima_compra', 'is', null).limit(5000)
    const hoy = hoyISO()
    return ((data ?? []) as any[]).filter((c) => {
      const ciclo = Number(c.frecuencia_compra_dias) - antes
      if (ciclo <= 0) return false
      const objetivoFecha = new Date(new Date(c.ultima_compra + 'T00:00:00').getTime() + ciclo * 86400000).toISOString().slice(0, 10)
      return objetivoFecha === hoy
    })
  }
  return []  // nivel_alcanzado es event-driven (al sumar puntos), no por cron
}

/** Crea (lazy) o reusa la campaña espejo de una automatización (para métricas/envíos). */
async function campaniaDe(adm: Adm, auto: any): Promise<string> {
  const cfg = auto.config ?? {}
  if (cfg.campania_id) return cfg.campania_id
  const { data } = await adm.from('campanias_crm').insert({
    nombre: `Auto · ${auto.nombre}`, objetivo: auto.trigger, canales: auto.canales ?? ['push'],
    mensaje: {}, estado: 'enviada', redactado_por: 'nora', es_demo: auto.es_demo,
  }).select('id').single()
  await adm.from('automatizaciones').update({ config: { ...cfg, campania_id: data.id } }).eq('id', auto.id)
  return data.id
}

export type ResumenAuto = { automatizacion: string; disparos: number }

export async function correrAutomatizaciones(adm: Adm): Promise<ResumenAuto[]> {
  const { data: autos } = await adm.from('automatizaciones').select('*').eq('activa', true)
  const out: ResumenAuto[] = []
  const hayEmail = hasEmailConfig()

  for (const auto of (autos ?? []) as any[]) {
    const clientes = await objetivo(adm, auto)
    if (!clientes.length) { await adm.from('automatizaciones').update({ ultima_corrida: new Date().toISOString() }).eq('id', auto.id); continue }

    const tpl: MensajeCanal = (auto.mensaje_template && Object.keys(auto.mensaje_template).length)
      ? auto.mensaje_template
      : (redactarPlantilla(triggerAObjetivo(auto.trigger), auto.canales ?? ['push']).email ?? { subject: auto.nombre, body: auto.nombre })
    const campaniaId = await campaniaDe(adm, auto)
    const canales: string[] = auto.canales ?? ['push']
    const envios: any[] = []
    let disparos = 0

    // push broadcast (una sola notificación si corresponde)
    if (canales.includes('push')) {
      await adm.from('notifications').insert({
        title: tpl.title ?? auto.nombre, body: tpl.body ?? '', type: 'automation',
        related_coupon_id: auto.cupon_ref ?? null, sent_at: new Date().toISOString(), sent_count: clientes.length,
      })
    }

    for (const c of clientes) {
      if (canales.includes('email') && c.email && hayEmail) {
        const r = await sendEmail(c.email, tpl.subject ?? auto.nombre, { html: tpl.html, text: tpl.body })
        envios.push({ campania_id: campaniaId, cliente_id: c.id, canal: 'email', estado: r.ok ? 'enviado' : 'encolado', enviado_at: r.ok ? new Date().toISOString() : null, es_demo: c.es_demo })
      } else if (canales.includes('email') && c.email) {
        envios.push({ campania_id: campaniaId, cliente_id: c.id, canal: 'email', estado: 'encolado', es_demo: c.es_demo })
      }
      if (canales.includes('whatsapp')) envios.push({ campania_id: campaniaId, cliente_id: c.id, canal: 'whatsapp', estado: 'encolado', es_demo: c.es_demo })
      if (canales.includes('push') && c.cuponera_user_id) envios.push({ campania_id: campaniaId, cliente_id: c.id, canal: 'push', estado: 'enviado', enviado_at: new Date().toISOString(), es_demo: c.es_demo })
      disparos++
    }
    if (envios.length) await adm.from('campania_envios').insert(envios)
    await adm.from('automatizaciones').update({ ultima_corrida: new Date().toISOString(), n_disparos: Number(auto.n_disparos ?? 0) + disparos }).eq('id', auto.id)
    out.push({ automatizacion: auto.nombre, disparos })
  }
  return out
}

function triggerAObjetivo(t: string): string {
  return t === 'cumpleanos' ? 'cumpleanos' : t === 'inactividad_30d' ? 'reactivar' : t === 'recompra_cronico' ? 'recompra' : 'fidelizar'
}
