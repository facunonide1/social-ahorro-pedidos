'use client'

import { Fragment, useEffect, useState } from 'react'

import type { Accion, Respuesta } from '@/lib/cerebro/conversacion'

export type Mensaje =
  | { id: string; de: 'yo'; texto: string }
  | { id: string; de: 'ella'; r: Respuesta | null; pensando?: boolean; resultado?: { ok: boolean; texto: string } }

/** **negrita** → <b>. Nada de HTML crudo: lo que llega es texto. */
function conNegritas(s: string) {
  return s.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith('**') && p.endsWith('**') ? <b key={i}>{p.slice(2, -2)}</b> : <Fragment key={i}>{p}</Fragment>)
}

/**
 * D.2 · El texto se escribe al ritmo de la voz.
 *
 * `progreso` (0..1) lo da el audio cuando hay voz: la parte del audio que ya
 * sonó. Sin voz, un ritmo de lectura parecido al de hablar. No aparece de
 * golpe en ningún caso.
 */
function Escribiendo({ texto, progreso, alTerminar }: {
  texto: string
  progreso: () => number | null
  alTerminar: () => void
}) {
  const [n, setN] = useState(0)
  useEffect(() => {
    let raf = 0
    const t0 = performance.now()
    const dur = Math.max(900, texto.length * 55)
    const paso = (t: number) => {
      const p = progreso()
      const k = p != null ? p : Math.min(1, (t - t0) / dur)
      setN(Math.floor(texto.length * k))
      if (k < 1) raf = requestAnimationFrame(paso)
      else { setN(texto.length); alTerminar() }
    }
    raf = requestAnimationFrame(paso)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto])
  return <>{conNegritas(texto.slice(0, n))}</>
}

export function Hilo({ mensajes, hablandoId, progreso, alTerminar, alAccionar }: {
  mensajes: Mensaje[]
  /** El mensaje que se está escribiendo ahora. */
  hablandoId: string | null
  progreso: () => number | null
  alTerminar: (id: string) => void
  alAccionar: (m: Mensaje & { de: 'ella' }, a: Accion) => void
}) {
  // D.1 · los mensajes viejos se van apagando.
  const total = mensajes.length
  return (
    <div className="hilo" aria-live="polite">
      {mensajes.map((m, i) => {
        const d = total - 1 - i
        const vejez = d >= 3 ? 'muy' : d >= 1 ? 'vieja' : ''
        if (m.de === 'yo') {
          return <div key={m.id} className={`msj va ${vejez}`}><div className="b">{m.texto}</div></div>
        }
        const r = m.r
        const escribiendo = m.id === hablandoId
        return (
          <div key={m.id} className={`msj ent ${escribiendo ? 'hab' : ''} ${vejez}`}>
            <span className="av7" />
            <div className="cuerpo">
              <div className="nom">NORA</div>
              <div className="b">
                {m.pensando || !r ? (
                  <div className="pens"><i /><i /><i /></div>
                ) : (
                  <>
                    {escribiendo
                      ? <Escribiendo texto={r.dicho} progreso={progreso} alTerminar={() => alTerminar(m.id)} />
                      : conNegritas(r.dicho)}
                    {!escribiendo ? (
                      <>
                        {r.texto ? <div className="lee">{conNegritas(r.texto)}</div> : null}
                        {r.cifras.length ? (
                          <div className="cif">
                            {r.cifras.map((c, j) => (
                              <div key={j}><div className="k">{c.k}</div><div className={`v ${c.tono ?? ''}`}>{c.v}</div></div>
                            ))}
                          </div>
                        ) : null}
                        {r.acciones.length && !m.resultado ? (
                          <div className="ax">
                            {r.acciones.map((a, j) => (
                              <button key={j}
                                className={a.primaria ? 'pr' : a.tipo === 'descartar' ? 'gh' : ''}
                                onClick={() => alAccionar(m as Mensaje & { de: 'ella' }, a)}>
                                {a.label}
                              </button>
                            ))}
                          </div>
                        ) : null}
                        {m.resultado ? <div className={`res ${m.resultado.ok ? '' : 'mal'}`}>{m.resultado.texto}</div> : null}
                        {r.pie ? <div className="pie6">{r.pie}</div> : null}
                      </>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
