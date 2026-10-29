'use client'

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'

/**
 * E · LA VOZ EN EL NAVEGADOR.
 *
 * ── E.3 · EL NÚCLEO LATE CON EL AUDIO REAL ──────────────────────────────────
 *
 * Un `AnalyserNode` sobre el `<audio>` que suena: la amplitud que mueve la
 * entidad es la del audio, cuadro por cuadro. No hay un número al azar en
 * ningún lado. Es lo que más vende la ilusión, y por eso no se simula.
 *
 * ── E.6 · SE PUEDE CORTAR ───────────────────────────────────────────────────
 *
 * `callar()` la para en seco y el texto se completa de una vez. Y el
 * interruptor de voz deja todo en texto, por si hay gente alrededor.
 *
 * ── E.7 · SI FALLA, EL TEXTO SIGUE ──────────────────────────────────────────
 *
 * Sin clave, sin crédito, sin red o con el tope agotado: `hablar()` devuelve
 * false, el progreso vuelve a null, y el texto se escribe a ritmo de lectura.
 * La razón se muestra una vez, chica, arriba.
 */

export type Gasto = { usados: number; tope: number; pct: number | null; cerca: boolean; agotado: boolean } | null

/** Si el audio no arrancó en este tiempo, se escribe sin él. */
const ARRANQUE_MS = 2500

export function useVoz(amp: MutableRefObject<number>, vozOn: boolean) {
  const audio = useRef<HTMLAudioElement | null>(null)
  const ctx = useRef<AudioContext | null>(null)
  const raf = useRef(0)
  const estado = useRef<{ texto: string; sonando: boolean; terminado: boolean; cortado: boolean } | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [gasto, setGasto] = useState<Gasto>(null)
  const [hayClave, setHayClave] = useState<boolean | null>(null)
  const vozOnRef = useRef(vozOn)
  vozOnRef.current = vozOn

  const refrescarGasto = useCallback(async () => {
    try {
      const r = await fetch('/api/cerebro/voz?solo_estado=1', { cache: 'no-store' })
      const j = await r.json()
      setHayClave(!!j.hay_clave)
      if (j.gasto?.autorizado) setGasto(j.gasto)
    } catch { /* sin red: el texto sigue */ }
  }, [])
  useEffect(() => { void refrescarGasto() }, [refrescarGasto])

  const callar = useCallback(() => {
    const a = audio.current
    if (a) { a.pause(); a.removeAttribute('src'); a.load() }
    audio.current = null
    cancelAnimationFrame(raf.current)
    amp.current = 0
    if (estado.current) estado.current.cortado = true
  }, [amp])

  /** Cuánto del audio ya sonó, 0..1. Null = no hay audio: se escribe a ritmo de lectura. */
  const progreso = useCallback((): number | null => {
    const e = estado.current
    if (!e) return null
    if (e.cortado || e.terminado) return 1
    const a = audio.current
    if (!a || !e.sonando) return 0
    // El mp3 en streaming no sabe su duración hasta el final: se estima por
    // la frase y se corrige a medida que avanza.
    const est = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : Math.max(e.texto.length * 0.062, a.currentTime + 0.4)
    return Math.min(0.99, a.currentTime / est)
  }, [])

  const hablar = useCallback(async (texto: string): Promise<boolean> => {
    callar()
    estado.current = null
    if (!vozOnRef.current || hayClave === false) return false

    const a = new Audio()
    a.preload = 'auto'
    audio.current = a
    const e = { texto, sonando: false, terminado: false, cortado: false }
    estado.current = e

    try {
      ctx.current ??= new AudioContext()
      if (ctx.current.state === 'suspended') await ctx.current.resume()
      const src = ctx.current.createMediaElementSource(a)
      const an = ctx.current.createAnalyser()
      an.fftSize = 512
      src.connect(an); an.connect(ctx.current.destination)
      const datos = new Uint8Array(an.fftSize)
      const latir = () => {
        an.getByteTimeDomainData(datos)
        let s = 0
        for (let i = 0; i < datos.length; i++) { const v = (datos[i] - 128) / 128; s += v * v }
        const rms = Math.sqrt(s / datos.length)
        // Suavizado corto: sube rápido y baja un poco más lento, como una voz.
        const objetivo = Math.min(1, rms * 4.2)
        amp.current += (objetivo - amp.current) * (objetivo > amp.current ? 0.5 : 0.18)
        raf.current = requestAnimationFrame(latir)
      }
      raf.current = requestAnimationFrame(latir)
    } catch {
      // Sin AudioContext suena igual; la entidad se abre pareja (lo hace el cliente).
    }

    return await new Promise<boolean>((res) => {
      let listo = false
      const fin = (ok: boolean) => { if (!listo) { listo = true; res(ok) } }
      const t = setTimeout(async () => {
        if (e.sonando) return
        callar(); estado.current = null
        fin(false)
      }, ARRANQUE_MS)
      a.addEventListener('playing', () => { e.sonando = true; clearTimeout(t); fin(true) }, { once: true })
      a.addEventListener('ended', () => {
        e.terminado = true
        cancelAnimationFrame(raf.current); amp.current = 0
        void refrescarGasto()
      }, { once: true })
      a.addEventListener('error', async () => {
        clearTimeout(t)
        cancelAnimationFrame(raf.current); amp.current = 0
        estado.current = null
        // El <audio> no dice por qué falló. Se le pregunta al servidor sin
        // generar nada.
        try {
          const r = await fetch(`/api/cerebro/voz?t=${encodeURIComponent(texto)}&solo_estado=1`)
          const j = await r.json()
          setHayClave(!!j.hay_clave)
          if (!j.hay_clave) setAviso('Sin voz: falta la clave de ElevenLabs en el servidor. Escribo igual.')
          else if (j.gasto?.agotado) setAviso('Sin voz: se llegó al tope del mes. Escribo igual.')
          else setAviso('Sin voz: no pude generar el audio. Escribo igual.')
          if (j.gasto?.autorizado) setGasto(j.gasto)
        } catch { setAviso('Sin voz: no hay red. Escribo igual.') }
        fin(false)
      }, { once: true })
      a.src = `/api/cerebro/voz?t=${encodeURIComponent(texto)}`
      a.play().catch(() => { /* lo resuelve 'error' o el tiempo de arranque */ })
    })
  }, [amp, callar, hayClave, refrescarGasto])

  // Si se apaga la voz mientras habla, se calla.
  useEffect(() => { if (!vozOn) callar() }, [vozOn, callar])
  useEffect(() => () => { callar(); void ctx.current?.close() }, [callar])

  return { hablar, progreso, callar, aviso, setAviso, gasto, hayClave, refrescarGasto }
}

/* ── el micrófono ────────────────────────────────────────────────────────── */

/**
 * Escuchar usa el reconocimiento del navegador (Chrome y Safari). Donde no
 * existe, el botón queda apagado y lo dice: se escribe.
 */
export function useMicrofono(alEntender: (t: string) => void, alParcial: (t: string) => void) {
  const rec = useRef<any>(null)
  const [escuchando, setEscuchando] = useState(false)
  const [soportado, setSoportado] = useState(false)

  useEffect(() => {
    setSoportado(typeof window !== 'undefined' &&
      !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition))
  }, [])

  const parar = useCallback(() => { try { rec.current?.stop() } catch { /* ya paró */ } }, [])

  const escuchar = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return
    const r = new SR()
    r.lang = 'es-AR'
    r.interimResults = true
    r.maxAlternatives = 1
    r.onresult = (ev: any) => {
      let fin = '', parcial = ''
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const x = ev.results[i]
        if (x.isFinal) fin += x[0].transcript
        else parcial += x[0].transcript
      }
      if (parcial) alParcial(parcial)
      if (fin.trim()) alEntender(fin.trim())
    }
    r.onend = () => setEscuchando(false)
    r.onerror = () => setEscuchando(false)
    rec.current = r
    setEscuchando(true)
    r.start()
  }, [alEntender, alParcial])

  return { escuchar, parar, escuchando, soportado }
}
