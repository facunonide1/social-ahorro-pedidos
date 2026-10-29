/**
 * v1.5-cerebro · EL CEREBRO Y LA VOZ, PROBADOS.
 *
 * ── QUÉ PRUEBA ──────────────────────────────────────────────────────────────
 *
 * 1. **Qué entiende y qué no.** Frases como las diría Facundo, con lo que
 *    tendría que entender cada una. Lo prohibido tiene que caer en
 *    «prohibido» antes que en cualquier otra regla.
 * 2. **Que lo hablado no tenga montos** (D.4), en las respuestas armadas
 *    sobre el estado REAL de hoy.
 * 3. **Que null no se haya vuelto cero**: la venta del día y la caja que no
 *    se saben llegan como null con su motivo.
 * 4. **Que todo «llevame» y todo «abrir el sector» lleve a una pantalla que
 *    existe.**
 *
 * ── CÓMO, SIN ESCRIBIR NADA ─────────────────────────────────────────────────
 *
 * `cerebro_estado()` mira auth.uid(), y un script no tiene sesión. Así que
 * para armar respuestas se le da a `responder` un cliente que lee la misma
 * fila del snapshot con el de servicio y que NO registra en la bitácora: la
 * prueba no deja rastros. Las funciones de la base (que dicen que no al que
 * no es dueño, que registran el intento bloqueado) se prueban aparte en SQL.
 *
 *   npm run probar:cerebro
 */
import { existsSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

import { entender, DESTINOS, type Catalogo } from '../lib/cerebro/entender'
import { responder } from '../lib/cerebro/responder'
import { tieneMontos } from '../lib/cerebro/conversacion'

function env(n: string): string {
  const v = process.env[n]
  if (!v) throw new Error(`Falta ${n}`)
  return v
}
const adm = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { persistSession: false } })

let fallas = 0
const ok = (s: string) => console.log(`  ok    ${s}`)
const mal = (s: string) => { console.log(`  MAL   ${s}`); fallas++ }

function existeRuta(href: string): boolean {
  const limpio = href.split('?')[0].replace(/^\//, '')
  return ['app/(admin)/', 'app/'].some((b) => existsSync(`${b}${limpio}/page.tsx`))
}

/** El cliente de la prueba: lee el snapshot como si fuera el dueño y no escribe. */
const shim: any = {
  from: (t: string) => adm.from(t),
  rpc: async (fn: string) => {
    if (fn === 'cerebro_estado') {
      const { data, error } = await adm.from('cerebro_snapshot').select('*').eq('id', true).maybeSingle<any>()
      if (error || !data) return { data: null, error }
      return {
        data: {
          ...data.datos, autorizado: true, calculado_at: data.calculado_at, tardo_ms: data.tardo_ms,
          edad_s: Math.round((Date.now() - new Date(data.calculado_at).getTime()) / 1000),
          ultimo_error: data.ultimo_error, ultimo_error_at: data.ultimo_error_at,
        },
        error: null,
      }
    }
    if (fn === 'voz_registrar') return { data: '00000000-0000-0000-0000-000000000000', error: null }
    return { data: null, error: { message: `la prueba no llama a ${fn}` } }
  },
}

async function main() {
  console.log('\n1 · qué entiende\n')
  const { data: suc } = await adm.from('sucursales').select('id, nombre, codigo').eq('activa', true)
  const cat: Catalogo = {
    sucursales: (suc ?? []) as any,
    personas: [{ nombre: 'Facundo', user_id: 'x', sucursal_id: null }],
    agentes: ['Abasto', 'Tesoro', 'Reparto', 'Canal', 'Margen', 'Despacho', 'Vigía', 'Documentos', 'Convenio']
      .map((n) => ({ id: n.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(), nombre: n })),
  }
  const CASOS: [string, string, string?][] = [
    ['¿Cómo venimos?', 'contame'],
    ['Mostrame Arabia', 'contame'],
    ['¿Qué espera mi firma?', 'contame'],
    ['Mostrame lo que está apagado', 'contame'],
    ['Llevame a la bandeja', 'llevame'],
    ['Pedime para 1 mes', 'cambia'],
    ['pedí 36 de Ibupirac', 'hace'],
    ['Decile a Rocío que haga el control de heladera', 'hace'],
    ['¿Javier cerró la caja?', 'verificar'],
    ['pedile a Guzmán para Arabia', 'hace'],
    ['volvé atrás', 'cambia'],
    // lo que no puede: tiene que caer acá aunque otra regla también encaje
    ['Pagale a Del Sud', 'prohibido', 'pagar_sin_firma'],
    ['Publicá el Ibuprofeno en PedidosYa', 'prohibido', 'publicar_en_canal'],
    ['Cambiá el precio del Ibupirac a 5000', 'prohibido', 'cambiar_precio_venta'],
    ['Firmá la orden de Asopro', 'prohibido', 'firmar_por_voz'],
    ['Despedí a Javier', 'prohibido', 'tocar_personal'],
    // y lo que no entiende, lo dice
    ['asdf qwer', 'no_entendi'],
    ['dejame todo listo para el lunes', 'no_entendi'],
  ]
  for (const [f, cosa, accion] of CASOS) {
    const i = entender(f, cat) as any
    const bien = i.cosa === cosa && (!accion || i.accion === accion)
    ;(bien ? ok : mal)(`«${f}» → ${i.cosa}${i.accion ? ` (${i.accion})` : ''}`)
  }

  console.log('\n2 · lo que se dice no tiene montos, sobre el estado real\n')
  const FRASES = ['¿Cómo venimos?', '¿Qué espera mi firma?', 'Mostrame lo que está apagado',
    '¿Cómo viene Guzmán?', '¿Cómo viene Arabia?', '¿Qué dice Abasto?', '¿Qué dice Canal?',
    '¿Cerraron la caja de Tesei?', 'Pedime para 1 mes', 'pedí 36 de Ibupirac',
    'Pagale a Del Sud', 'Cambiá el precio del Ibupirac', 'asdf']
  for (const f of FRASES) {
    const r = await responder(shim, f)
    if (tieneMontos(r.dicho)) mal(`«${f}» dice un monto en voz alta: «${r.dicho}»`)
    else ok(`«${f}» → «${r.dicho}»${r.cifras.length ? `  [${r.cifras.map((c) => `${c.k}: ${c.v}`).join(' · ')}]` : ''}`)
    if (r.dicho.split(/[.!?]\s/).length > 4) mal(`«${f}» habla más de tres frases`)
    for (const a of r.acciones) {
      if (a.tipo === 'navegar' && a.href && !existeRuta(a.href)) mal(`«${f}» tiene un botón a ${a.href}, que no existe`)
    }
    if (r.navegar && !existeRuta(r.navegar)) mal(`«${f}» lleva a ${r.navegar}, que no existe`)
  }

  console.log('\n3 · null no es cero\n')
  const { data: sn } = await adm.from('cerebro_snapshot').select('datos, calculado_at, tardo_ms').eq('id', true).maybeSingle<any>()
  if (!sn) { mal('el snapshot no existe: el cron no corrió nunca'); }
  else {
    ok(`snapshot de ${new Date(sn.calculado_at).toLocaleString('es-AR')}, tardó ${sn.tardo_ms} ms`)
    for (const s of sn.datos.sucursales as any[]) {
      const v = s.vendido_hoy
      if (v.valor === 0 && !v.de_cuando) mal(`${s.nombre}: venta de hoy en 0 sin dato que la respalde`)
      else if (v.valor == null && !v.por_que_no) mal(`${s.nombre}: venta de hoy null sin motivo`)
      else ok(`${s.nombre}: venta de hoy ${v.valor == null ? `null — ${v.por_que_no}` : v.valor}`)
      if (s.caja.ultimo_cierre == null && !s.caja.por_que_no) mal(`${s.nombre}: caja sin cierre y sin motivo`)
      if (s.stock.valor != null && !s.stock.de_cuando) mal(`${s.nombre}: stock sin la fecha del maestro`)
    }
  }

  console.log('\n4 · cada destino existe\n')
  for (const d of DESTINOS) (existeRuta(d.href) ? ok : mal)(`llevame a ${d.destino} → ${d.href}`)

  console.log(fallas === 0 ? '\nTODO BIEN' : `\nFALLA · ${fallas}`)
  if (fallas) process.exit(1)
}

main().catch((e) => { console.error('FALLA · la prueba no pudo correr:', e?.message ?? e); process.exit(1) })
