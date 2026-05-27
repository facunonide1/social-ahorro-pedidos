'use client'

import { useEffect, useState } from 'react'

import { NoraCard } from '@/components/nora/nora-card'
import { NoraTyping } from '@/components/nora/nora-typing'

type Coaching = {
  mensaje: string
  datos: {
    score: number
    tareas_hoy: number
    completadas_hoy: number
    ranking_pos: number
    ranking_total: number
    faltan_para_siguiente: number
    siguiente_nivel: string | null
  }
}

export function NoraCoachingSection({ empleadoId }: { empleadoId: string }) {
  const [data, setData] = useState<Coaching | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(true)

  useEffect(() => {
    let cancel = false
    async function load() {
      setBusy(true)
      setError(null)
      try {
        const r = await fetch(
          `/api/nora/employee-coaching/${empleadoId}`,
          { cache: 'no-store' },
        )
        const j = await r.json()
        if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`)
        if (!cancel) setData(j)
      } catch (e: any) {
        if (!cancel) setError(e?.message ?? 'error desconocido')
      } finally {
        if (!cancel) setBusy(false)
      }
    }
    load()
    return () => {
      cancel = true
    }
  }, [empleadoId])

  if (busy && !data) {
    return (
      <NoraCard contexto="tu coach del día">
        <NoraTyping label="NORA está pensando tu coaching…" />
      </NoraCard>
    )
  }

  if (error || !data) {
    // En silencio si falla — no romper la pantalla
    return null
  }

  const d = data.datos
  return (
    <NoraCard contexto="tu coach del día">
      <p className="whitespace-pre-wrap">{data.mensaje}</p>
      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
        <span className="rounded-full border bg-background/60 px-2 py-0.5">
          Tareas hoy: <b className="text-foreground">{d.tareas_hoy}</b>
        </span>
        <span className="rounded-full border bg-background/60 px-2 py-0.5">
          Completadas hoy: <b className="text-foreground">{d.completadas_hoy}</b>
        </span>
        {d.ranking_total > 0 && (
          <span className="rounded-full border bg-background/60 px-2 py-0.5">
            Ranking sucursal:{' '}
            <b className="text-foreground">
              #{d.ranking_pos} de {d.ranking_total}
            </b>
          </span>
        )}
        {d.siguiente_nivel && (
          <span className="rounded-full border bg-background/60 px-2 py-0.5">
            Próximo nivel: <b className="text-foreground">{d.siguiente_nivel}</b>{' '}
            (faltan {d.faltan_para_siguiente.toLocaleString('es-AR')} pts)
          </span>
        )}
      </div>
    </NoraCard>
  )
}
