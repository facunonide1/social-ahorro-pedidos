'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Bell, BellOff, X } from 'lucide-react'

import { createClient } from '@/lib/supabase/client'
import { ORIGIN_LABELS } from '@/lib/types'
import type { TipoEnvio, OrderOrigin } from '@/lib/types'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { OrderTipoEnvioBadge } from '@/components/crm/order-tipo-envio-badge'
import { cn } from '@/lib/utils'

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
  const sb = createClient()
  const [pending, setPending] = useState<{ count: number; items: Incoming[] }>({
    count: 0,
    items: [],
  })
  const [soundOn, setSoundOn] = useState(false)
  const [connected, setConnected] = useState(false)
  const audioRef = useRef<AudioContext | null>(null)
  const soundOnRef = useRef(false)
  soundOnRef.current = soundOn

  function toggleSound() {
    if (!audioRef.current) {
      try {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        audioRef.current = new Ctx()
      } catch {
        /* sin audio */
      }
    }
    const next = !soundOn
    setSoundOn(next)
    try {
      localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
    } catch {
      /* ignorar */
    }
    if (next && audioRef.current) {
      try {
        playDing(audioRef.current)
      } catch {
        /* ignorar */
      }
    }
  }

  // Restaurar preferencia de sonido al montar
  useEffect(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY)
      if (v === '1') setSoundOn(true)
    } catch {
      /* ignorar */
    }
  }, [])

  // Suscripción Realtime a INSERT en orders
  useEffect(() => {
    const channel = sb
      .channel('sa-orders-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders' },
        (payload) => {
          const row = payload.new as Incoming
          setPending((prev) => ({
            count: prev.count + 1,
            items: [row, ...prev.items].slice(0, 20),
          }))
          if (soundOnRef.current && audioRef.current) {
            try {
              playDing(audioRef.current)
            } catch {
              /* ignorar */
            }
          }
        },
      )
      .subscribe((status) => {
        setConnected(status === 'SUBSCRIBED')
      })

    return () => {
      sb.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function acknowledge() {
    setPending({ count: 0, items: [] })
    router.refresh()
  }

  return (
    <>
      {/* Indicador realtime */}
      <Badge
        variant={connected ? 'success' : 'warning'}
        className="gap-1.5"
        title={connected ? 'Conectado en tiempo real' : 'Reconectando…'}
      >
        <span
          className={cn(
            'inline-block size-1.5 rounded-full',
            connected ? 'bg-success' : 'bg-warning',
          )}
        />
        {connected ? 'En vivo' : 'Offline'}
      </Badge>

      {/* Toggle sonido */}
      <Button
        type="button"
        variant={soundOn ? 'secondary' : 'outline'}
        size="sm"
        onClick={toggleSound}
        title={soundOn ? 'Sonido activado' : 'Activar sonido de alerta'}
      >
        {soundOn ? <Bell className="size-4" /> : <BellOff className="size-4" />}
        Alertas
      </Button>

      {/* Pop-up flotante con nuevos pedidos */}
      {pending.count > 0 && (
        <Card className="fixed bottom-5 right-5 z-50 w-[min(340px,calc(100vw-2.5rem))] border-2 border-primary shadow-xl shadow-primary/20 animate-in fade-in slide-in-from-bottom-4">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-primary">
                  {pending.count === 1 ? 'Nuevo pedido' : 'Nuevos pedidos'}
                </div>
                <div className="text-xl font-bold tracking-tight">
                  {pending.count} {pending.count === 1 ? 'pedido entró' : 'pedidos entraron'}
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={() => setPending({ count: 0, items: [] })}
              >
                <X className="size-4" />
              </Button>
            </div>

            <div className="flex max-h-44 flex-col gap-1.5 overflow-y-auto">
              {pending.items.slice(0, 5).map((it) => (
                <Link
                  key={it.id}
                  href={`/pedidos/${it.id}`}
                  className="flex flex-col gap-0.5 rounded-md border border-border bg-muted/40 px-2.5 py-1.5 transition-colors hover:bg-muted"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold tabular-nums">{it.codigo}</span>
                    <OrderTipoEnvioBadge tipo={it.tipo_envio} />
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    {it.customer_name || '—'} · {ORIGIN_LABELS[it.origin]}
                  </span>
                </Link>
              ))}
              {pending.count > 5 && (
                <div className="text-center text-[11px] text-muted-foreground">
                  y {pending.count - 5} más…
                </div>
              )}
            </div>

            <Button onClick={acknowledge} className="w-full">
              Actualizar tablero
            </Button>
          </CardContent>
        </Card>
      )}
    </>
  )
}
