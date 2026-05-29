'use client'

import { useEffect, useState } from 'react'
import { RefreshCw, TrendingUp } from 'lucide-react'

import { NoraCard } from '@/components/nora/nora-card'
import { NoraTyping } from '@/components/nora/nora-typing'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Prediccion = {
  titulo: string
  detalle: string
  severidad: 'alta' | 'media' | 'baja'
  area: 'operaciones' | 'finanzas' | 'tareas' | 'stock'
  accion: string
}

type Predictions = {
  resumen: string
  predicciones: Prediccion[]
  datos: {
    lotes_por_vencer: number
    lotes_valor_riesgo: number
    tareas_en_riesgo: number
    stock_bajo_minimo: number
    facturas_7d: number
    facturas_monto: number
  }
}

const SEV_STYLES: Record<Prediccion['severidad'], string> = {
  alta: 'border-l-destructive bg-destructive/5',
  media: 'border-l-amber-500 bg-amber-500/5',
  baja: 'border-l-muted-foreground/40 bg-muted/30',
}

const SEV_LABEL: Record<Prediccion['severidad'], string> = {
  alta: 'Alta',
  media: 'Media',
  baja: 'Baja',
}

export function NoraPredictionsCard() {
  const [data, setData] = useState<Predictions | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(true)

  async function load() {
    setBusy(true)
    setError(null)
    try {
      const r = await fetch('/api/nora/predictions', { cache: 'no-store' })
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
      <NoraCard contexto="predicciones">
        <NoraTyping label="NORA está mirando hacia adelante…" />
      </NoraCard>
    )
  }

  if (error) {
    return (
      <NoraCard contexto="predicciones">
        <p className="text-sm">
          No pude calcular las predicciones.{' '}
          <span className="text-muted-foreground">{error}</span>
        </p>
      </NoraCard>
    )
  }

  if (!data) return null

  const preds = data.predicciones ?? []

  return (
    <NoraCard
      contexto="predicciones"
      actions={
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={load}
        >
          <RefreshCw className={busy ? 'size-3.5 animate-spin' : 'size-3.5'} />
          Recalcular
        </Button>
      }
    >
      {data.resumen && (
        <p className="flex items-start gap-1.5">
          <TrendingUp className="mt-0.5 size-4 shrink-0 text-nora" />
          <span>{data.resumen}</span>
        </p>
      )}

      {preds.length === 0 ? (
        <p className="mt-2 text-muted-foreground">
          No veo riesgos relevantes a futuro. Todo bajo control.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {preds.map((p, i) => (
            <li
              key={i}
              className={cn(
                'rounded-md border border-l-[3px] bg-background/60 px-3 py-2',
                SEV_STYLES[p.severidad] ?? SEV_STYLES.baja,
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-foreground">{p.titulo}</span>
                <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">
                  {SEV_LABEL[p.severidad] ?? p.severidad} · {p.area}
                </span>
              </div>
              <p className="mt-0.5 text-muted-foreground">{p.detalle}</p>
              {p.accion && (
                <p className="mt-1 text-[12px] text-nora">→ {p.accion}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </NoraCard>
  )
}
