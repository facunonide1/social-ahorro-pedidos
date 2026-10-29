'use client'

import Link from 'next/link'

import {
  ars, arsCorto, type EstadoCerebro, type NodoAgente, type NodoSucursal,
} from '@/lib/cerebro/lectura'
import { COLOR } from './geometria'

export type Seleccion =
  | { tipo: 'agente'; id: string }
  | { tipo: 'sucursal'; id: string }
  | { tipo: 'nucleo' }

const TZ = 'America/Argentina/Buenos_Aires'

/**
 * A.5 · De cuándo es un número, dicho corto.
 *
 * El stock es del maestro de SIFACO —puede ser de hace una semana— y eso se
 * tiene que ver al lado del número, no en una nota al pie.
 */
export function deCuando(iso: string | null | undefined): string | null {
  if (!iso) return null
  // «2026-09» es un período, no un instante.
  if (/^\d{4}-\d{2}$/.test(iso)) return `período ${iso.slice(5)}/${iso.slice(0, 4)}`
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const s = Math.round((Date.now() - d.getTime()) / 1000)
  if (s < 90) return 'recién'
  if (s < 3600) return `hace ${Math.round(s / 60)} min`
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`
  return `del ${d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', timeZone: TZ })}`
}

function Lin({ l, r, tono, fecha }: { l: string; r: string | null; tono?: string; fecha?: string | null }) {
  return (
    <div className="lin">
      <span className="l">{l}</span>
      <span className={`r ${r == null ? 'na' : tono ?? ''}`}>
        {r ?? 'no se puede saber'}
        {fecha ? <span className="f">{fecha}</span> : null}
      </span>
    </div>
  )
}

function PanelAgente({ a }: { a: NodoAgente }) {
  return (
    <>
      <div className="kk">{!a.construido ? 'sin construir' : a.encendido ? 'hoy' : 'apagado'}</div>
      {a.encendido
        ? <div className="dd" style={{ color: '#D8D3E6', fontSize: 14 }}>{a.frase}</div>
        : <div className="vv na">{a.motivoApagado}</div>}
      <div className="sp" />
      <Lin l="Qué hace" r={a.queHace} />
      <Lin l="Nivel" r={a.nivel ? a.nivel.replace(/_/g, ' ') : null} />
      <Lin l="Esperan tu firma" r={String(a.esperanFirma)} tono={a.esperanFirma ? 'ma' : ''} />
      <Lin l="Lee de" r={a.de_donde} />
      <Lin l="El dato es" r={a.de_cuando ? deCuando(a.de_cuando) : (a.construido ? 'en vivo' : null)} />
      {a.queLoEnciende ? (
        <div className="nd">
          {a.encendido ? 'Lo que todavía no puede saber: ' : 'Lo enciende: '}
          {a.queLoEnciende}.
        </div>
      ) : null}
    </>
  )
}

function PanelSucursal({ s }: { s: NodoSucursal }) {
  const pres = (p: { presente: boolean | null }) =>
    p.presente == null ? 'no se sabe si está' : p.presente ? 'está' : 'no marcó entrada'
  return (
    <>
      <div className="kk">{s.sin_datos ? 'sin datos' : 'ahora'}</div>
      {s.vendido_hoy.valor != null
        ? <><div className="vv">{ars(s.vendido_hoy.valor)}</div><div className="dd">vendido hoy · {deCuando(s.vendido_hoy.de_cuando)}</div></>
        : <><div className="vv na">No sé cuánto vendió hoy</div><div className="dd">{s.vendido_hoy.por_que_no}</div></>}
      <div className="sp" />
      <Lin l="Stock al costo" r={arsCorto(s.stock.valor)} fecha={s.stock.valor != null ? `maestro ${deCuando(s.stock.de_cuando)}` : null} />
      {s.stock.valor == null ? <div className="nd">{s.stock.por_que_no}</div> : null}
      <Lin l="Venta estimada (3 meses)" r={arsCorto(s.venta_estimada.valor)}
        fecha={s.venta_estimada.periodo ? `estimada · ${s.venta_estimada.periodo}` : null} />
      <Lin l="Cobertura" r={s.rotacion.cobertura_meses != null ? `${s.rotacion.cobertura_meses.toLocaleString('es-AR')} meses` : null}
        fecha={deCuando(s.rotacion.de_cuando)} />
      <Lin l="Último cierre de caja"
        r={s.caja.ultimo_cierre ? `${s.caja.ultimo_cierre}${s.caja.quien ? ` · ${s.caja.quien}` : ''}` : null} />
      {s.caja.por_que_no ? <div className="nd">{s.caja.por_que_no}</div> : null}
      <Lin l="Tareas abiertas" r={String(s.tareas.abiertas)} tono={s.tareas.vencidas ? 'al' : ''}
        fecha={s.tareas.vencidas ? `${s.tareas.vencidas} vencidas` : null} />
      <Lin l="Completadas hoy" r={String(s.tareas.completadas_hoy)} />
      <div className="sp" />
      <div className="kk">quién está</div>
      {s.personas.lista.length
        ? s.personas.lista.map((p) => (
            <Lin key={p.nombre} l={`${p.nombre}${p.puesto ? ` · ${p.puesto}` : ''}`} r={pres(p)}
              tono={p.presente ? 'ok' : p.presente === false ? 'al' : ''} />
          ))
        : null}
      {s.personas.por_que_no ? <div className="nd">{s.personas.por_que_no}</div> : null}
      <div className="sp" />
      <div className="kk">lo último que hizo</div>
      {s.ultimos_hechos.length
        ? s.ultimos_hechos.map((h, i) => (
            <div key={i} className="lin"><span className="l" style={{ fontSize: 12.5 }}>{deCuando(h.at)} · {h.texto}</span></div>
          ))
        : <div className="nd">No hay ninguna tarea real de esta sucursal en el sistema.</div>}
    </>
  )
}

function PanelNucleo({ e }: { e: EstadoCerebro }) {
  const ag = e.agentes
  const cuenta = (t: string) => ag.filter((a) => a.estado === t).length
  const f = e.espera.por_fuente ?? {}
  const NOMBRE: Record<string, string> = {
    decision: 'Decisiones', hallazgo: 'Hallazgos', error_de_canal: 'Errores de canal',
    tarea: 'Tareas vencidas', firma: 'Firmas de lotes', debito: 'Débitos',
  }
  return (
    <>
      <div className="kk">lo que espera una decisión</div>
      <div className="vv">{arsCorto(e.espera.plata_total) ?? 'sin plata medible'}</div>
      <div className="dd">
        en {e.espera.cuantos} cosas. Además, {arsCorto(e.espera.costo_por_dia) ?? '—'} por día en decisiones
        sin tomar: es un caudal, no se suma con lo de arriba.
      </div>
      <div className="sp" />
      {Object.entries(f).map(([k, v]) => (
        <Lin key={k} l={`${NOMBRE[k] ?? k} · ${v.cuantos}`} r={v.plata != null ? arsCorto(v.plata) : 'sin plata'}
          tono={k === 'error_de_canal' ? 'ma' : 'al'} />
      ))}
      <div className="nd">
        {e.espera.no_se_pueden_costear} de {e.espera.cuantos} no se pueden costear: su plata es null, no cero.
        Y {e.espera.esperando_turno.toLocaleString('es-AR')} hallazgos esperan turno detrás del presupuesto de interrupción.
      </div>
      <div className="sp" />
      <div className="kk">el equipo</div>
      <Lin l="Trabajando" r={String(cuenta('ok'))} tono="ok" />
      <Lin l="Les falta un dato" r={String(cuenta('al'))} tono="al" />
      <Lin l="Necesitan tu firma" r={String(cuenta('ma'))} tono="ma" />
      <Lin l="Apagados" r={String(cuenta('off'))} />
      <div className="nd">
        {ag.filter((a) => !a.construido).length} de los {ag.length} no están construidos: el dibujo los muestra
        para que no parezca que el sector está cubierto.
      </div>
    </>
  )
}

export function Panel({ estado, sel, onCerrar }: {
  estado: EstadoCerebro
  sel: Seleccion | null
  onCerrar: () => void
}) {
  let titulo = '—'
  let color: string | null = '#6D3DD4'
  let cuerpo: React.ReactNode = null
  let href: string | null = null

  if (sel?.tipo === 'agente') {
    const a = estado.agentes.find((x) => x.id === sel.id)
    if (a) { titulo = a.nombre; color = COLOR[a.estado]; cuerpo = <PanelAgente a={a} />; href = a.href }
  } else if (sel?.tipo === 'sucursal') {
    const s = estado.sucursales.find((x) => x.id === sel.id)
    if (s) {
      titulo = s.nombre; color = COLOR[s.estado]; cuerpo = <PanelSucursal s={s} />
      href = '/admin/direccion/sucursales'
    }
  } else if (sel?.tipo === 'nucleo') {
    titulo = 'Toda la cadena'; cuerpo = <PanelNucleo e={estado} />; href = '/admin/direccion/bandeja'
  }

  return (
    <aside className={`pan ${sel ? 'on' : ''}`} aria-hidden={!sel}>
      <div className="ph">
        <span className="pt" style={color ? { background: color } : { border: '1px solid #5F5873' }} />
        <b>{titulo}</b>
        <button className="x" onClick={onCerrar} aria-label="Cerrar">✕</button>
      </div>
      <div className="pb">{cuerpo}</div>
      {href ? (
        <div className="pf">
          <Link className="bt2" href={href}>◆ Abrir el sector<span style={{ marginLeft: 'auto', color: '#5F5873' }}>›</span></Link>
        </div>
      ) : null}
    </aside>
  )
}
