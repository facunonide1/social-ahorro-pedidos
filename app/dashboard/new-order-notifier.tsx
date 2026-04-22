'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { TIPO_ENVIO_LABELS, TIPO_ENVIO_COLORS, ORIGIN_LABELS } from '@/lib/types'
import type { TipoEnvio, OrderOrigin } from '@/lib/types'

type Incoming = {
  id: string
  codigo: string
  customer_name: string | null
  tipo_envio: TipoEnvio
  origin: OrderOrigin
  created_at: string
}

const STORAGE_KEY = 'sa-notif-sound'

function playDing(audioCtx: AudioContext) {
  // Dos tonos cortos (E5 y A5). Web Audio puro, sin archivo externo.
  const now = audioCtx.currentTime
  for (const [freq, start] of [[659.25, 0], [880, 0.18]] as const) {
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    osc.connect(gain)
    gain.connect(audioCtx.destination)
    gain.gain.setValueAtTime(0.0001, now + start)
    gain.gain.exponentialRampToValueAtTime(0.18, now + start + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + start + 0.28)
    osc.start(now + start)
    osc.stop(now + start + 0.3)
  }
}

export default function NewOrderNotifier() {
  const router = useRouter()
  const [since, setSince] = useState(() => new Date().toISOString())
  const [pending, setPending] = useState<{ count: number; items: Incoming[] }>({ count: 0, items: [] })
  const [soundOn, setSoundOn] = useState(false)
  const audioRef = useRef<AudioContext | null>(null)

  // Cargo preferencia guardada. Importante: el audio recién queda "activo"
  // cuando el user hace click en el toggle (por autoplay policy del browser),
  // así que arrancamos en off aunque localStorage diga on.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved === '1') {
        // queda pendiente de arranque del AudioContext por interacción
      }
    } catch {}
  }, [])

  function toggleSound() {
    if (!audioRef.current) {
      try {
        const Ctx = (window.AudioContext || (window as any).webkitAudioContext)
        audioRef.current = new Ctx()
      } catch {}
    }
    const next = !soundOn
    setSoundOn(next)
    try { localStorage.setItem(STORAGE_KEY, next ? '1' : '0') } catch {}
    // ping de confirmación al activar
    if (next && audioRef.current) {
      try { playDing(audioRef.current) } catch {}
    }
  }

  useEffect(() => {
    let cancelled = false
    async function poll() {
      try {
        const res = await fetch(`/api/orders/since?t=${encodeURIComponent(since)}`, { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json() as { count: number; items: Incoming[] }
        if (cancelled) return
        if (data.count > 0) {
          setPending(prev => ({
            count: data.count,
            items: data.items,
          }))
          if (soundOn && audioRef.current) {
            try { playDing(audioRef.current) } catch {}
          }
        }
      } catch {
        // red caída, no rompo
      }
    }
    const t = setInterval(poll, 30_000)
    return () => { cancelled = true; clearInterval(t) }
  }, [since, soundOn])

  function acknowledge() {
    setSince(new Date().toISOString())
    setPending({ count: 0, items: [] })
    router.refresh()
  }

  return (
    <>
      {/* Toggle de sonido (va en el header junto al reloj) */}
      <button onClick={toggleSound}
        title={soundOn ? 'Sonido de alerta activado' : 'Activar sonido de alerta cuando entra un pedido nuevo'}
        style={{
          padding: '8px 10px', borderRadius: 10, fontSize: 13, fontWeight: 600,
          cursor: 'pointer', fontFamily: 'inherit',
          background: soundOn ? '#eaf7ef' : '#fff',
          color:      soundOn ? '#1f8a4c' : '#888',
          border: `1.5px solid ${soundOn ? '#8fd1a8' : '#f0ede8'}`,
        }}>
        {soundOn ? '🔔 Alertas' : '🔕 Alertas'}
      </button>

      {/* Badge flotante con pedidos nuevos */}
      {pending.count > 0 && (
        <div style={{
          position: 'fixed', right: 20, bottom: 20, zIndex: 50,
          background: '#fff', border: '2px solid #FF6D6E', borderRadius: 16,
          boxShadow: '0 12px 32px rgba(255,109,110,0.25)',
          padding: 14, minWidth: 280, maxWidth: 340,
          display: 'flex', flexDirection: 'column', gap: 10,
          animation: 'sa-pulse 1.6s ease-out infinite',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#FF6D6E', letterSpacing: '0.4px' }}>
                NUEVO{pending.count === 1 ? '' : 'S'} PEDIDO{pending.count === 1 ? '' : 'S'}
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#2a2a2a', letterSpacing: '-0.5px' }}>
                {pending.count} {pending.count === 1 ? 'pedido entró' : 'pedidos entraron'}
              </div>
            </div>
            <button onClick={() => setPending({ count: 0, items: [] })}
              style={{ background: 'transparent', border: 'none', color: '#bbb', fontSize: 18, cursor: 'pointer', padding: 4 }}
              title="Ocultar">✕</button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 180, overflowY: 'auto' }}>
            {pending.items.slice(0, 5).map(it => {
              const tc = TIPO_ENVIO_COLORS[it.tipo_envio]
              return (
                <Link key={it.id} href={`/pedidos/${it.id}`}
                  style={{ textDecoration: 'none', color: 'inherit',
                    background: '#faf8f5', border: '0.5px solid #f0ede8', borderRadius: 10,
                    padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>{it.codigo}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: tc.fg, background: tc.bg, border: `0.5px solid ${tc.border}`, padding: '1px 6px', borderRadius: 999, letterSpacing: '0.3px', textTransform: 'uppercase' }}>
                      {TIPO_ENVIO_LABELS[it.tipo_envio]}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: '#888' }}>
                    {it.customer_name || '—'} · {ORIGIN_LABELS[it.origin]}
                  </div>
                </Link>
              )
            })}
            {pending.count > 5 && (
              <div style={{ fontSize: 11, color: '#999', textAlign: 'center', padding: 4 }}>
                y {pending.count - 5} más…
              </div>
            )}
          </div>

          <button onClick={acknowledge}
            style={{
              padding: '10px 12px', border: 'none', borderRadius: 10,
              background: '#FF6D6E', color: '#fff', fontSize: 13, fontWeight: 700,
              cursor: 'pointer',
            }}>
            Actualizar tablero
          </button>
        </div>
      )}

      {/* Animación de pulso suave */}
      <style>{`
        @keyframes sa-pulse {
          0%   { box-shadow: 0 12px 32px rgba(255,109,110,0.25); }
          50%  { box-shadow: 0 12px 38px rgba(255,109,110,0.55); }
          100% { box-shadow: 0 12px 32px rgba(255,109,110,0.25); }
        }
      `}</style>
    </>
  )
}
