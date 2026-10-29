'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { arsCorto, SNAPSHOT_VIEJO_S, type EstadoCerebro, type LecturaCerebro } from '@/lib/cerebro/lectura'
import {
  COLOR, CX, CY, POS_AGENTE, POS_SUCURSAL, VIEWBOX, curva, esDeNoche, xyAgente, xySucursal,
} from './geometria'
import { Panel, deCuando, type Seleccion } from './panel'
import './cerebro.css'

type Capa = 'todo' | 'agentes' | 'sucursales'

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

  const estado: EstadoCerebro | null = lectura.ok ? lectura.estado : null

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
    let giro = 0, raf = 0
    const t0 = performance.now()
    const ritmo = noche ? 0.55 : 1

    const vivir = (t: number) => {
      const k = ((t - t0) / 1000) * ritmo
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
          <radialGradient id="gn"><stop offset="0%" stopColor="#A78BFA" /><stop offset="58%" stopColor="#6D3DD4" /><stop offset="100%" stopColor="#3B1F7A" /></radialGradient>
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
