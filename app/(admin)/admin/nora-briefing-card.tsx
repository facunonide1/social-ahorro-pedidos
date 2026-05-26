'use client'

import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'

import { NoraCard } from '@/components/nora/nora-card'
import { NoraTyping } from '@/components/nora/nora-typing'
import { Button } from '@/components/ui/button'

type Briefing = {
  mensaje: string
  datos: {
    facturas_7d: number
    facturas_monto: number
    tareas_vencidas: number
    stock_critico: number
    lotes_por_vencer: number
    fecha: string
  }
}

export function NoraBriefingCard() {
  const [data, setData] = useState<Briefing | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(true)

  async function load() {
    setBusy(true)
    setError(null)
    try {
      const r = await fetch('/api/nora/daily-briefing', { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`)
      setData(j)
    } catch (e: any) {
      setError(e?.message ?? 'error desconocido')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  if (busy && !data) {
    return (
      <NoraCard contexto="briefing del día">
        <NoraTyping label="NORA está analizando los datos…" />
      </NoraCard>
    )
  }

  if (error) {
    return (
      <NoraCard contexto="briefing del día">
        <p className="text-sm">
          No pude generar el briefing.{' '}
          <span className="text-muted-foreground">{error}</span>
        </p>
      </NoraCard>
    )
  }

  if (!data) return null

  const d = data.datos
  return (
    <NoraCard
      contexto="briefing del día"
      actions={
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={load}
        >
          <RefreshCw className={busy ? 'size-3.5 animate-spin' : 'size-3.5'} />
          Regenerar
        </Button>
      }
    >
      <p className="whitespace-pre-wrap">{data.mensaje}</p>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground sm:grid-cols-4">
        <Pill label="Facturas 7d" value={`${d.facturas_7d}`} sub={`$${d.facturas_monto.toLocaleString('es-AR')}`} />
        <Pill label="Tareas vencidas" value={`${d.tareas_vencidas}`} />
        <Pill label="Stock crítico" value={`${d.stock_critico}`} />
        <Pill label="Lotes 30d" value={`${d.lotes_por_vencer}`} />
      </div>
    </NoraCard>
  )
}

function Pill({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-md border bg-background/60 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wider">{label}</div>
      <div className="font-mono text-sm font-semibold text-foreground tabular-nums">
        {value}
      </div>
      {sub && <div className="font-mono text-[10px] tabular-nums">{sub}</div>}
    </div>
  )
}
