'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import { arsCorto, SNAPSHOT_VIEJO_S, type EstadoCerebro, type LecturaCerebro } from '@/lib/cerebro/tipos'
import {
  COLOR, CX, CY, POS_AGENTE, POS_SUCURSAL, VIEWBOX, curva, esDeNoche, xyAgente, xySucursal,
} from './geometria'
import { Panel, deCuando, type Seleccion } from './panel'
import { Hilo, type Mensaje } from './hilo'
import { EJEMPLOS, type Accion, type Respuesta } from '@/lib/cerebro/conversacion'
import './cerebro.css'

type Capa = 'todo' | 'agentes' | 'sucursales'

/**
 * C.1 · Los seis estados de la entidad. Cada uno cambia el color y el ritmo:
 * el color del velo y del foco, y cuánto respira.
 */
export type EstadoEntidad = 'calma' | 'pensando' | 'hablando' | 'trabajando' | 'escuchando' | 'alerta'
const EST: Record<EstadoEntidad, { c: string; velo: string; t: string | null; ritmo: number }> = {
  calma: { c: '#8B5CF6', velo: '#C4B5FD', t: null, ritmo: 1 },
  pensando: { c: '#A78BFA', velo: '#DDD6FE', t: 'pensando', ritmo: 1.8 },
  hablando: { c: '#C4B5FD', velo: '#EDE9FE', t: null, ritmo: 1.3 },
  trabajando: { c: '#5B8DEF', velo: '#93C5FD', t: 'revisando', ritmo: 1.4 },
  escuchando: { c: '#2EE1A8', velo: '#86EFAC', t: 'te escucho', ritmo: 0.6 },
  alerta: { c: '#E8921F', velo: '#FDBA74', t: 'algo cambió', ritmo: 2.2 },
}

const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-AR', {
  hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires',
})
const fechaCorta = (iso: string) => {
  const d = new Date(iso)
  const hoy = new Date().toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })
  const dia = d.toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })
  return dia === hoy ? hora(iso) : `${d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' })} ${hora(iso)}`
}

const SVGNS = 'http://www.w3.org/2000/svg'
const TZ = 'America/Argentina/Buenos_Aires'

/** Los anillos de la entidad, en planos distintos. Del prototipo. */
const ORB = [
  { rx: 58, ry: 19, rot: 0, sp: 0.22, c: '#A78BFA', o: 0.45, w: 1.1 },
  { rx: 52, ry: 17, rot: 62, sp: -0.17, c: '#C4B5FD', o: 0.38, w: 1 },
  { rx: 64, ry: 14, rot: 118, sp: 0.13, c: '#8B5CF6', o: 0.3, w: 0.9 },
  { rx: 46, ry: 24, rot: 28, sp: -0.26, c: '#7DD3FC', o: 0.22, w: 0.8 },
  { rx: 72, ry: 11, rot: 150, sp: 0.09, c: '#6D3DD4', o: 0.26, w: 0.8 },
]

/**
 * B · EL CEREBRO.
 *
 * Dos anillos: adentro los agentes —lo que el sistema hace—, afuera las
 * sucursales —dónde pasa—. El color dice el estado y un agente apagado no
 * tiene pulso. Una sucursal sin datos aparece en gris y lo dice: no se
 * inventa un número para que el dibujo quede lindo.
 *
 * Las animaciones van por fuera de React, sobre el SVG: son sesenta cuadros
 * por segundo y no tienen por qué pasar por un render.
 */
export function CerebroClient({ inicial }: { inicial: LecturaCerebro }) {
  const [lectura, setLectura] = useState<LecturaCerebro>(inicial)
  const [sel, setSel] = useState<Seleccion | null>(null)
  const [capa, setCapa] = useState<Capa>('todo')
  const [noche, setNoche] = useState(false)

  const raiz = useRef<HTMLDivElement>(null)
  const svg = useRef<SVGSVGElement>(null)
  /** Amplitud de la voz, 0..1. La alimenta el audio real (bloque E). */
  const amp = useRef(0)

  // ── C.1 · el estado de la entidad ───────────────────────────────────────
  const [ent, setEnt] = useState<{ e: EstadoEntidad; texto: string | null }>({ e: 'calma', texto: null })
  const entRef = useRef<EstadoEntidad>('calma')
  const poner = useCallback((e: EstadoEntidad, texto?: string | null) => {
    entRef.current = e
    setEnt({ e, texto: texto ?? EST[e].t })
  }, [])

  // ── C.3 · la bitácora: lo que de verdad pasó, con su hora ───────────────
  const [bitacora, setBitacora] = useState<{ at: string; texto: string; ya?: boolean }[]>([])
  const anotar = useCallback((texto: string, at = new Date().toISOString(), ya = false) => {
    setBitacora((b) => [...b, { at, texto, ya }].slice(-7))
  }, [])

  const [texto, setTexto] = useState('')
  const input = useRef<HTMLInputElement>(null)
  /** Lo que corta la voz. Lo completa el bloque E; hasta entonces, no hay voz que cortar. */
  const callar = useRef<() => void>(() => {})

  const estado: EstadoCerebro | null = lectura.ok ? lectura.estado : null
  const router = useRouter()

  // ── D · la conversación ─────────────────────────────────────────────────
  const [mensajes, setMensajes] = useState<Mensaje[]>([])
  const [hablandoId, setHablandoId] = useState<string | null>(null)
  /** Cuánto del audio ya sonó, 0..1, o null si no hay audio. Lo da el bloque E. */
  const progresoVoz = useRef<() => number | null>(() => null)
  /** Habla una frase. Devuelve false si no hubo audio (sin voz, sin red, sin crédito). */
  const hablarVoz = useRef<(t: string) => Promise<boolean>>(async () => false)
  const alTerminarDe = useRef<Record<string, () => void>>({})
  /** E.6 · el interruptor de voz, por si hay gente alrededor. */
  const [vozOn, setVozOn] = useState(true)

  // ── A · se refresca solo, una vez por minuto, como el cálculo ───────────
  const refrescar = useCallback(async () => {
    try {
      const r = await fetch('/api/cerebro/estado', { cache: 'no-store' })
      setLectura(await r.json())
    } catch {
      setLectura({ ok: false, estado: null, por_que: 'no hay red: no pude volver a leer el estado', leido_en_ms: 0 })
    }
  }, [])
  useEffect(() => {
    const t = setInterval(refrescar, 60_000)
    return () => clearInterval(t)
  }, [refrescar])

  useEffect(() => {
    setNoche(esDeNoche())
    const t = setInterval(() => setNoche(esDeNoche()), 5 * 60_000)
    return () => clearInterval(t)
  }, [])

  // ── la geometría, a partir de los datos ─────────────────────────────────
  const agentes = useMemo(() => (estado?.agentes ?? []).map((a) => {
    const p = POS_AGENTE[a.id] ?? { a: 0, r: 230 }
    const [x, y] = xyAgente(p.a, p.r)
    return { ...a, x, y }
  }), [estado])

  const sucursales = useMemo(() => (estado?.sucursales ?? []).map((s) => {
    const p = POS_SUCURSAL[s.codigo] ?? { a: 200, r: 380 }
    const [x, y] = xySucursal(p.a, p.r)
    return { ...s, x, y }
  }), [estado])

  /** Las coordenadas de un nódulo, sea agente o sucursal. */
  const dondeEsta = useCallback((id: string | null | undefined) => {
    if (!id) return null
    const a = agentes.find((x) => x.id === id)
    if (a) return { x: a.x, y: a.y, path: `sin-${a.id}`, grande: false }
    const s = sucursales.find((x) => x.id === id || x.codigo === id)
    if (s) return { x: s.x, y: s.y, path: `sins-${s.id}`, grande: true }
    return null
  }, [agentes, sucursales])

  // ── las ondas del núcleo ────────────────────────────────────────────────
  const onda = useCallback(() => {
    const s = svg.current
    if (!s) return
    ;['o1', 'o2'].forEach((id, i) => {
      const e = s.querySelector<SVGCircleElement>(`#${id}`)
      if (!e) return
      const t1 = performance.now() + i * 240
      const p = (t: number) => {
        if (t < t1) { requestAnimationFrame(p); return }
        const k = Math.min(1, (t - t1) / 1200)
        e.setAttribute('r', String(38 + k * 170))
        e.setAttribute('opacity', String((1 - k) * 0.28))
        e.setAttribute('stroke-width', String(1.5 - k))
        if (k < 1) requestAnimationFrame(p); else e.setAttribute('opacity', '0')
      }
      requestAnimationFrame(p)
    })
  }, [])

  // ── C.2 · el foco que viaja hasta el nódulo que revisa ──────────────────
  const enfocar = useCallback((id: string | null | undefined, ms = 1800) => {
    const s = svg.current
    const f = s?.querySelector<SVGCircleElement>('#foco')
    const d = dondeEsta(id)
    if (!f) return
    f.style.transition = 'cx .8s cubic-bezier(.3,.9,.3,1),cy .8s cubic-bezier(.3,.9,.3,1),opacity .4s,r .5s'
    f.setAttribute('cx', String(d?.x ?? CX)); f.setAttribute('cy', String(d?.y ?? CY))
    f.setAttribute('r', String(d?.grande ? 40 : d ? 24 : 34))
    f.style.opacity = '.55'
    setTimeout(() => { f.style.opacity = '0' }, ms)
  }, [dondeEsta])

  // ── C.4 · mira hacia donde habla ────────────────────────────────────────
  //
  // Si menciona Arabia, la entidad se desplaza hacia Arabia y la sinapsis se
  // enciende. Es lo que hace que la frase tenga un lugar.
  const mirar = useCallback((id: string | null | undefined) => {
    const s = svg.current
    const d = dondeEsta(id)
    const e = s?.querySelector<SVGGElement>('#ent')
    if (!s || !d || !e) return
    e.style.transition = 'transform .7s cubic-bezier(.3,.9,.3,1)'
    e.style.transform = `translate(${((d.x - CX) * 0.07).toFixed(1)}px,${((d.y - CY) * 0.07).toFixed(1)}px)`
    const p = s.querySelector<SVGPathElement>(`#${d.path}`)
    if (p) { p.style.opacity = '.85'; p.style.strokeWidth = '2.4' }
    setTimeout(() => {
      e.style.transform = 'translate(0px,0px)'
      if (p) { p.style.opacity = ''; p.style.strokeWidth = '' }
    }, 3200)
  }, [dondeEsta])

  // ── C.6 · lo que firmás cambia el cerebro ───────────────────────────────
  //
  // No es un mensaje: el nódulo cambia de color con una onda, y después se
  // vuelve a leer el estado para que el dibujo quede como está la base.
  const firmar = useCallback((id: string | null | undefined, texto: string) => {
    const s = svg.current
    const d = dondeEsta(id)
    anotar(`✓ ${texto}`, new Date().toISOString(), true)
    onda()
    if (!s || !d) { void refrescar(); return }
    const cuerpo = s.querySelector<SVGElement>(id && agentes.some((a) => a.id === id) ? `#n-${id} .cuerpo` : `#s-${d.path.slice(5)} .caja2`)
    cuerpo?.setAttribute('stroke', '#2EE1A8')
    const o = document.createElementNS(SVGNS, 'circle')
    o.setAttribute('cx', String(d.x)); o.setAttribute('cy', String(d.y))
    o.setAttribute('fill', 'none'); o.setAttribute('stroke', '#2EE1A8'); o.setAttribute('stroke-width', '2')
    s.querySelector('#pul')?.appendChild(o)
    const t0 = performance.now()
    const ex = (t: number) => {
      const k = Math.min(1, (t - t0) / 900)
      o.setAttribute('r', String(16 + k * 40)); o.setAttribute('opacity', String((1 - k) * 0.8))
      if (k < 1) requestAnimationFrame(ex); else o.remove()
    }
    requestAnimationFrame(ex)
    s.querySelector<SVGPathElement>(`#${d.path}`)?.setAttribute('stroke', '#2EE1A8')
    setTimeout(() => { void refrescar() }, 1200)
  }, [dondeEsta, agentes, anotar, onda, refrescar])

  // ── D · decir una respuesta ─────────────────────────────────────────────
  //
  // Primero mira hacia donde habla y abre el panel; después habla (bloque E)
  // y el texto se escribe al ritmo del audio. Si hay que ir a otra pantalla,
  // va cuando terminó de decirlo.
  const decir = useCallback((id: string, r: Respuesta) => {
    if (r.mirar) mirar(r.mirar)
    if (r.abrir) setSel(r.abrir.tipo === 'nucleo' ? { tipo: 'nucleo' } : { tipo: r.abrir.tipo, id: r.abrir.id! })
    poner('hablando')
    setHablandoId(id)
    alTerminarDe.current[id] = () => {
      setHablandoId((h) => (h === id ? null : h))
      if (entRef.current === 'hablando') poner('calma')
      if (r.navegar) router.push(r.navegar)
    }
    void hablarVoz.current(r.dicho)
  }, [mirar, poner, router])

  const enviar = useCallback(async (t: string, via: 'texto' | 'voz' = 'texto') => {
    const limpio = t.trim()
    if (!limpio) return
    callar.current()
    setTexto('')
    const yo = `y${Date.now()}`, ella = `e${Date.now()}`
    setMensajes((m) => [...m, { id: yo, de: 'yo' as const, texto: limpio },
      { id: ella, de: 'ella' as const, r: null, pensando: true }].slice(-8))
    poner('pensando')
    onda()
    let r: Respuesta
    try {
      const res = await fetch('/api/cerebro/hablar', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ texto: limpio, via }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j?.error ?? `error ${res.status}`)
      r = j
    } catch (e: any) {
      r = {
        id: null, cosa: 'no_entendi', dicho: 'No te pude contestar: se cortó la conexión con el sistema.',
        texto: null, cifras: [], acciones: [], pie: e?.message ?? null, mirar: null, abrir: null,
        navegar: null, voz: null, propone: false,
      }
    }
    setMensajes((m) => m.map((x) => (x.id === ella ? { ...x, r, pensando: false } : x)))
    if (r.voz) setVozOn(r.voz === 'on')
    decir(ella, r)
  }, [poner, onda, decir])

  /** Lo que pasa al tocar un botón de un mensaje. Confirmar es un toque, nunca la voz. */
  const accionar = useCallback(async (m: Mensaje & { de: 'ella' }, a: Accion) => {
    if (a.tipo === 'preguntar' && a.texto) { void enviar(a.texto); return }
    if (a.tipo === 'navegar' && a.href) { router.push(a.href); return }
    if (a.tipo === 'abrir') { setSel({ tipo: 'nucleo' }); return }
    if (!m.r?.id) return
    const marcar = (resultado: { ok: boolean; texto: string }) =>
      setMensajes((ms) => ms.map((x) => (x.id === m.id ? { ...x, resultado } : x)))
    try {
      const res = await fetch('/api/cerebro/confirmar', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: m.r.id, descartar: a.tipo === 'descartar' }),
      })
      const j = await res.json()
      marcar({ ok: !!j.ok, texto: j.texto ?? (j.ok ? 'Hecho.' : 'No se pudo.') })
      // C.6 · lo que firmás cambia el cerebro.
      if (j.ok && a.tipo === 'confirmar') firmar(j.nodo ?? null, j.texto ?? 'hecho')
    } catch {
      marcar({ ok: false, texto: 'No se pudo: se cortó la conexión. No se hizo nada.' })
    }
  }, [enviar, router, firmar])

  // B.4 · se expande cuando habla. Con audio, la amplitud es la del audio
  // real (bloque E). Sin audio, se abre parejo mientras escribe: no se
  // simula un latido que no hay.
  useEffect(() => {
    if (!hablandoId) { amp.current = 0; return }
    let raf = 0
    const f = () => {
      if (progresoVoz.current() == null) amp.current += (0.22 - amp.current) * 0.08
      raf = requestAnimationFrame(f)
    }
    raf = requestAnimationFrame(f)
    return () => { cancelAnimationFrame(raf); amp.current = 0 }
  }, [hablandoId])

  // ⌘K enfoca la caja.
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); input.current?.focus() }
    }
    document.addEventListener('keydown', f)
    return () => document.removeEventListener('keydown', f)
  }, [])

  // ── C.3 · la bitácora arranca con lo último que pasó de verdad ──────────
  const vistos = useRef<Set<string>>(new Set())
  useEffect(() => {
    const act = estado?.actividad ?? []
    const clave = (e: { at: string; texto: string }) => `${e.at}|${e.texto}`
    if (!vistos.current.size) {
      act.forEach((e) => vistos.current.add(clave(e)))
      setBitacora(act.slice(0, 6).reverse().map((e) => ({ at: e.at, texto: e.texto })))
      return
    }
    // Lo que apareció desde la última lectura: alerta, y a la bitácora.
    const nuevos = act.filter((e) => !vistos.current.has(clave(e)))
    nuevos.forEach((e) => vistos.current.add(clave(e)))
    if (nuevos.length && entRef.current !== 'hablando' && entRef.current !== 'escuchando') {
      const n = nuevos[0]
      poner('alerta', n.texto)
      enfocar(n.nodo, 2200)
      nuevos.slice(0, 3).reverse().forEach((e) => anotar(e.texto, e.at))
      setTimeout(() => { if (entRef.current === 'alerta') poner('calma') }, 2600)
    }
  }, [estado, poner, enfocar, anotar])

  // ── C.2 · trabaja entre pregunta y pregunta ─────────────────────────────
  //
  // Cada tanto revisa algo: el foco viaja al nódulo y el estado lo dice
  // abajo. Lo que revisa es real —las corridas de los crons, los detectores,
  // las importaciones, las propuestas de los agentes— y se dice con la hora
  // en que pasó, no con la de ahora.
  useEffect(() => {
    const act = estado?.actividad ?? []
    if (!act.length) return
    let i = 0
    const trabajar = () => {
      if (entRef.current !== 'calma') return
      const e = act[i++ % Math.min(act.length, 12)]
      poner('trabajando', `revisando · ${e.texto}`)
      enfocar(e.nodo, 1800)
      setBitacora((b) => (b.some((x) => x.at === e.at && x.texto === e.texto) ? b
        : [...b, { at: e.at, texto: e.texto }].slice(-7)))
      setTimeout(() => { if (entRef.current === 'trabajando') poner('calma') }, 2600)
    }
    const cada = (noche ? 15 : 7) * 1000
    const t0 = setTimeout(trabajar, 3500)
    const t = setInterval(trabajar, cada)
    return () => { clearTimeout(t0); clearInterval(t) }
  }, [estado, noche, poner, enfocar])

  // ── B.3 · los pulsos ────────────────────────────────────────────────────
  //
  // De los agentes al núcleo y al revés, del color del agente. Los apagados
  // no tienen. Los de las sucursales son de otro color —son las ventas
  // entrando— y por eso SOLO salen de una sucursal que tiene venta de hoy
  // medida. Hoy no hay ninguna: dibujar ventas que no se ven sería mentir.
  useEffect(() => {
    const s = svg.current
    if (!s) return
    const capaPulsos = s.querySelector<SVGGElement>('#pul')
    if (!capaPulsos) return
    const vivos = agentes.filter((a) => a.estado !== 'off')
    const conVenta = sucursales.filter((x) => x.vendido_hoy.valor != null)
    const lento = noche ? 2.2 : 1

    const lanzar = (pathId: string, color: string, r: number, dur: number, entra: boolean) => {
      const p = s.querySelector<SVGPathElement>(`#${pathId}`)
      if (!p) return
      const c = document.createElementNS(SVGNS, 'circle')
      c.setAttribute('r', String(r)); c.setAttribute('fill', color)
      capaPulsos.appendChild(c)
      const L = p.getTotalLength(), t0 = performance.now()
      const paso = (t: number) => {
        const k = Math.min(1, (t - t0) / dur)
        const pt = p.getPointAtLength(entra ? L * (1 - k) : L * k)
        c.setAttribute('cx', String(pt.x)); c.setAttribute('cy', String(pt.y))
        c.setAttribute('opacity', String(k < 0.12 ? k / 0.12 : k > 0.88 ? (1 - k) / 0.12 : 0.9))
        if (k < 1) requestAnimationFrame(paso); else c.remove()
      }
      requestAnimationFrame(paso)
    }

    const tA = vivos.length ? setInterval(() => {
      const a = vivos[Math.floor(Math.random() * vivos.length)]
      lanzar(`sin-${a.id}`, COLOR[a.estado] ?? '#5F5873', 2.4, (1000 + Math.random() * 700) * lento, Math.random() > 0.45)
    }, 560 * lento) : null
    const tS = conVenta.length ? setInterval(() => {
      const x = conVenta[Math.floor(Math.random() * conVenta.length)]
      lanzar(`sins-${x.id}`, '#5B8DEF', 2, 1500 * lento, true)
    }, 1900 * lento) : null

    return () => { if (tA) clearInterval(tA); if (tS) clearInterval(tS) }
  }, [agentes, sucursales, noche])

  // ── B.4 · la entidad ────────────────────────────────────────────────────
  //
  // Respira en silencio y se expande cuando habla. La amplitud sale de
  // `amp`, que en el bloque E alimenta un analizador sobre el audio real.
  useEffect(() => {
    const s = svg.current
    if (!s) return
    const go = s.querySelector<SVGGElement>('#orbes')!
    go.innerHTML = ''
    const orbes = ORB.map((o) => {
      const e = document.createElementNS(SVGNS, 'ellipse')
      e.setAttribute('cx', String(CX)); e.setAttribute('cy', String(CY))
      e.setAttribute('class', 'orb-r'); e.setAttribute('stroke', o.c)
      e.setAttribute('stroke-width', String(o.w))
      go.appendChild(e)
      return { ...o, el: e }
    })
    const parts = Array.from({ length: 14 }, (_, i) => {
      const c = document.createElementNS(SVGNS, 'circle')
      c.setAttribute('r', (0.9 + Math.random() * 1.5).toFixed(1))
      c.setAttribute('fill', i % 4 === 0 ? '#2EE1A8' : '#C4B5FD')
      go.appendChild(c)
      return {
        el: c, rr: 34 + Math.random() * 48, ang: Math.random() * 360,
        sp: (0.25 + Math.random() * 0.75) * (Math.random() > 0.5 ? 1 : -1),
        ac: 0.35 + Math.random() * 0.5, fase: Math.random() * 6.28,
      }
    })
    const nu = s.querySelector<SVGCircleElement>('#nu')!
    const vel = s.querySelector<SVGCircleElement>('#vel1')!
    const chi = s.querySelector<SVGCircleElement>('#chispa')!
    const veloC = s.querySelector<SVGStopElement>('#gv-c')!
    const nucleoC = s.querySelector<SVGStopElement>('#gn-c')!
    const foco = s.querySelector<SVGCircleElement>('#foco')!
    let giro = 0, raf = 0, k = 0, antes = performance.now(), ultimo: EstadoEntidad | null = null
    // C.7 · de noche, menos actividad.
    const base = noche ? 0.55 : 1

    const vivir = (t: number) => {
      const e = EST[entRef.current]
      // C.1 · el estado cambia el ritmo: se integra el tiempo para que
      // cambiar de estado no haga saltar la animación.
      const ritmo = base * e.ritmo
      k += ((t - antes) / 1000) * ritmo
      antes = t
      if (ultimo !== entRef.current) {
        ultimo = entRef.current
        veloC.setAttribute('stop-color', e.velo)
        nucleoC.setAttribute('stop-color', e.velo)
        foco.setAttribute('stroke', e.c)
      }
      const a = amp.current
      const resp = Math.sin(k * 0.9) * 0.5 + 0.5
      nu.setAttribute('r', (22 + resp * 2.2 + a * 11).toFixed(1))
      vel.setAttribute('r', (41 + resp * 3 + a * 20).toFixed(1))
      vel.setAttribute('opacity', (0.5 + a * 0.4).toFixed(2))
      chi.setAttribute('cx', (CX - 2 + Math.sin(k * 0.7) * 2.4).toFixed(1))
      chi.setAttribute('cy', (CY - 8 + Math.cos(k * 0.9) * 1.8).toFixed(1))
      chi.setAttribute('opacity', (0.3 + a * 0.45).toFixed(2))
      giro += (0.6 + a * 1.4) * ritmo
      orbes.forEach((o, i) => {
        const esc = 1 + a * 0.3 + Math.sin(k * 0.8 + i) * 0.03
        o.el.setAttribute('rx', (o.rx * esc).toFixed(1))
        o.el.setAttribute('ry', (o.ry * esc * (1 - a * 0.25)).toFixed(1))
        o.el.setAttribute('transform', `rotate(${(o.rot + giro * o.sp).toFixed(1)} ${CX} ${CY})`)
        if (i === 0) o.el.setAttribute('stroke', e.c)
        o.el.setAttribute('opacity', (o.o * (0.75 + a * 0.7)).toFixed(2))
      })
      parts.forEach((p) => {
        p.ang += p.sp * (1 + a * 2.2) * ritmo
        const rad = (p.ang * Math.PI) / 180
        const rr = p.rr * (1 + a * 0.35) + Math.sin(k * 1.3 + p.fase) * 3
        p.el.setAttribute('cx', (CX + Math.cos(rad) * rr).toFixed(1))
        p.el.setAttribute('cy', (CY + Math.sin(rad) * rr * 0.42).toFixed(1))
        p.el.setAttribute('opacity', (p.ac * (0.55 + a * 0.8)).toFixed(2))
      })
      raiz.current?.classList.toggle('habla', a > 0.03)
      raf = requestAnimationFrame(vivir)
    }
    raf = requestAnimationFrame(vivir)
    return () => cancelAnimationFrame(raf)
  }, [noche])

  // Escape cierra el panel.
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') setSel(null) }
    document.addEventListener('keydown', f)
    return () => document.removeEventListener('keydown', f)
  }, [])

  const opacidad = (k: 'agentes' | 'sucursales') =>
    capa === 'todo' || capa === k ? undefined : { opacity: 0.1, pointerEvents: 'none' as const }

  const ahora = new Date().toLocaleString('es-AR', {
    weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: TZ,
  })

  return (
    <div ref={raiz} className={`cbr ${noche ? 'noche' : ''}`}>
      <div className="jefe">
        {ahora}
        {estado ? (
          <>
            {' · '}<b>{arsCorto(estado.espera.plata_total) ?? 'sin plata medible'} esperando una decisión</b>
            {' · '}
            <span className={estado.edad_s > SNAPSHOT_VIEJO_S ? 'viejo' : ''}>
              dato {deCuando(estado.calculado_at)}
              {estado.ultimo_error ? ` · la última corrida falló (${deCuando(estado.ultimo_error_at)}): muestro la anterior` : ''}
            </span>
          </>
        ) : null}
      </div>

      <svg ref={svg} className="lienzo" viewBox={VIEWBOX} preserveAspectRatio="xMidYMid meet">
        <defs>
          <radialGradient id="gn"><stop id="gn-c" offset="0%" stopColor="#A78BFA" /><stop offset="58%" stopColor="#6D3DD4" /><stop offset="100%" stopColor="#3B1F7A" /></radialGradient>
          <radialGradient id="ga"><stop offset="0%" stopColor="#8B5CF6" stopOpacity=".30" /><stop offset="45%" stopColor="#6D3DD4" stopOpacity=".10" /><stop offset="100%" stopColor="#6D3DD4" stopOpacity="0" /></radialGradient>
          <radialGradient id="gv"><stop id="gv-c" offset="0%" stopColor="#C4B5FD" stopOpacity=".5" /><stop offset="70%" stopColor="#7C3AED" stopOpacity=".16" /><stop offset="100%" stopColor="#7C3AED" stopOpacity="0" /></radialGradient>
          <filter id="br2" x="-150%" y="-150%" width="400%" height="400%"><feGaussianBlur stdDeviation="9" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          <filter id="br"><feGaussianBlur stdDeviation="6" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>

        {/* sinapsis de los agentes */}
        <g className="capa capa-sin" style={opacidad('agentes')}>
          {agentes.map((a) => (
            <path key={a.id} id={`sin-${a.id}`} d={curva(a.x, a.y)}
              className={`sinapsis ${a.estado === 'off' ? '' : 'viva'}`}
              stroke={COLOR[a.estado] ?? '#5F5873'}
              strokeDasharray={a.estado === 'off' ? '3 5' : undefined} />
          ))}
        </g>

        {/* el anillo de afuera y sus sinapsis */}
        <g className="capa capa-suc-sin" style={opacidad('sucursales')}>
          <ellipse cx={CX} cy={CY} rx={382} ry={199} className="anillo-ext" />
          {sucursales.map((s) => (
            <path key={s.id} id={`sins-${s.id}`} d={curva(s.x, s.y, 0.06)} fill="none"
              stroke={s.sin_datos ? '#3A344A' : '#5B8DEF'} strokeWidth={0.8}
              strokeDasharray={s.sin_datos ? '2 5' : undefined}
              opacity={s.vendido_hoy.valor != null ? 0.35 : 0.13} className="sinapsis" />
          ))}
        </g>

        <g id="pul" />

        {/* la entidad */}
        <g id="ent" onClick={() => setSel({ tipo: 'nucleo' })}>
          <circle cx={CX} cy={CY} r={150} fill="url(#ga)" />
          <circle className="ola" id="o1" cx={CX} cy={CY} r={50} />
          <circle className="ola" id="o2" cx={CX} cy={CY} r={50} />
          <g id="orbes" />
          <circle id="vel1" cx={CX} cy={CY} r={44} fill="url(#gv)" opacity={0.55} />
          <circle id="nu" cx={CX} cy={CY} r={23} fill="url(#gn)" filter="url(#br2)" />
          <circle className="foco" id="foco" cx={CX} cy={CY} r={26} />
          <circle id="chispa" cx={CX - 2} cy={CY - 8} r={6.5} fill="#fff" opacity={0.35} filter="url(#br)" />
        </g>

        {/* sucursales */}
        <g className="capa capa-suc" style={opacidad('sucursales')}>
          {sucursales.map((s) => {
            const per = s.personas.lista.slice(0, 3)
            const filas = Math.max(1, per.length)
            const w = 132, h = 30 + filas * 13
            const x = s.x - w / 2, y = s.y - h / 2
            const color = COLOR[s.estado]
            const venta = s.vendido_hoy.valor != null ? arsCorto(s.vendido_hoy.valor) : null
            return (
              <g key={s.id} id={`s-${s.id}`}
                className={`suc2 ${s.sin_datos ? 'gris' : ''} ${sel?.tipo === 'sucursal' && sel.id === s.id ? 'on' : ''}`}
                onClick={() => setSel({ tipo: 'sucursal', id: s.id })}>
                <rect className="caja2" x={x} y={y} width={w} height={h} rx={10} />
                <circle cx={x + 13} cy={y + 14} r={3.4} fill={color ?? 'none'} stroke={color ? 'none' : '#5F5873'} />
                <text className="nm2" x={x + 22} y={y + 18}>{s.nombre}</text>
                <text className="vn" x={x + w - 11} y={y + 18} textAnchor="end">
                  {s.sin_datos ? 'sin datos' : venta ?? 'venta: no sé'}
                </text>
                {per.length ? per.map((p, i) => (
                  <g key={i}>
                    <circle cx={x + 13} cy={y + 32 + i * 13} r={2.6}
                      fill={p.presente ? '#2EE1A8' : p.presente === false ? '#E8921F' : 'none'}
                      stroke={p.presente == null ? '#5F5873' : 'none'} />
                    <text className="pe" x={x + 21} y={y + 35 + i * 13}>{p.nombre}{p.puesto ? ` · ${p.puesto}` : ''}</text>
                  </g>
                )) : (
                  <text className="pe" x={x + 13} y={y + 35}>
                    {s.sin_datos ? 'no hay stock, venta ni caja' : 'nadie cargado acá'}
                  </text>
                )}
              </g>
            )
          })}
        </g>

        {/* agentes */}
        <g className="capa capa-nod" style={opacidad('agentes')}>
          {agentes.map((a) => {
            const c = COLOR[a.estado]
            const rr = a.estado === 'off' ? 12 : 16
            return (
              <g key={a.id} id={`n-${a.id}`}
                className={`nodo ${a.construido ? '' : 'sc'} ${sel?.tipo === 'agente' && sel.id === a.id ? 'on' : ''}`}
                onClick={() => setSel({ tipo: 'agente', id: a.id })}>
                <circle className="halo" cx={a.x} cy={a.y} r={rr + 19} />
                <circle className="cuerpo" cx={a.x} cy={a.y} r={rr}
                  fill={c ? 'rgba(255,255,255,.055)' : 'rgba(255,255,255,.022)'}
                  stroke={c ?? '#3A344A'} strokeWidth={c ? 1.4 : 1}
                  strokeDasharray={c ? undefined : '3 3'} />
                {c ? <circle cx={a.x} cy={a.y} r={4} fill={c} /> : null}
                <text x={a.x} y={a.y + rr + 16}>{a.nombre}</text>
                <text className="val" x={a.x} y={a.y + rr + 29}>{a.corto ?? ''}</text>
              </g>
            )
          })}
        </g>
      </svg>

      {!estado ? (
        <div className="nolei">
          <b>No pude leer el estado</b>
          {lectura.ok ? null : lectura.por_que}
        </div>
      ) : null}

      <div className="cap" role="group" aria-label="Capas">
        {(['todo', 'agentes', 'sucursales'] as Capa[]).map((k) => (
          <button key={k} className={capa === k ? 'on' : ''} onClick={() => setCapa(k)}>
            {k === 'todo' ? 'Todo' : k === 'agentes' ? 'Agentes' : 'Sucursales'}
          </button>
        ))}
      </div>

      {/* C.1 · lo que está haciendo, dicho abajo */}
      <div className={`estado ${ent.texto ? 'on' : ''}`}>
        <i style={{ background: EST[ent.e].c }} /><span>{ent.texto}</span>
      </div>

      {/* C.3 · la bitácora: lo que de verdad pasó, con la hora en que pasó */}
      <div className="bitac" aria-label="Bitácora">
        {[...bitacora].reverse().map((b, i) => (
          <div key={`${b.at}-${i}`} className={`bit ${b.ya ? 'ya' : ''}`}>
            <span className="h2">{fechaCorta(b.at)}</span><span>{b.texto}</span>
          </div>
        ))}
      </div>

      {/* D.1 · el hilo, al costado para no tapar el cerebro */}
      <Hilo mensajes={mensajes} hablandoId={hablandoId}
        progreso={() => progresoVoz.current()}
        alTerminar={(id) => alTerminarDe.current[id]?.()}
        alAccionar={accionar} />
      {mensajes.length ? <button className="limpiar" onClick={() => setMensajes([])}>limpiar</button> : null}

      <div className="voz">
        {!mensajes.length ? (
          <div className="sug">
            {EJEMPLOS.slice(0, 5).map((t) => <button key={t} onClick={() => void enviar(t)}>{t}</button>)}
          </div>
        ) : null}
        <div className={`caja ${hablandoId ? 'hab' : ''}`}>
          <span className="mic off" title="El micrófono llega con la voz">🎙</span>
          <input ref={input} value={texto} placeholder="Preguntale a NORA, o pedile algo…" autoComplete="off"
            onKeyDown={(e) => { if (e.key === 'Enter') void enviar(texto) }}
            onFocus={() => { if (entRef.current !== 'hablando') poner('escuchando') }}
            onBlur={() => { if (entRef.current === 'escuchando') poner('calma') }}
            onChange={(e) => {
              // C.5 · escribís mientras habla: deja de hablar.
              if (entRef.current === 'hablando') callar.current()
              setTexto(e.target.value)
              poner('escuchando')
            }} />
        </div>
      </div>

      <div className="leyc">
        <span><i style={{ background: '#2EE1A8' }} />trabajando</span>
        <span><i style={{ background: '#E8921F' }} />le falta un dato</span>
        <span><i style={{ background: '#E0485F' }} />necesita tu firma</span>
        <span><i style={{ border: '1px solid #5F5873' }} />apagado o sin datos</span>
      </div>

      {estado ? <Panel estado={estado} sel={sel} onCerrar={() => setSel(null)} /> : null}
    </div>
  )
}
