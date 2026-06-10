'use client'

import { useEffect, useState } from 'react'
import { Zap, RefreshCw } from 'lucide-react'

import { cn } from '@/lib/utils'

type Prediccion = {
  titulo: string
  detalle: string
  severidad: 'alta' | 'media' | 'baja'
  area: string
  accion: string
}

type Predictions = {
  resumen: string
  predicciones: Prediccion[]
}

const SEV_DOT: Record<Prediccion['severidad'], string> = {
  alta: 'bg-rose-400',
  media: 'bg-amber-400',
  baja: 'bg-white/40',
}

/**
 * Panel de predicciones de NORA (F6.5.T4) — fondo violeta oscuro fijo
 * (no usa --nora-deep porque en dark mode es claro). Próximas 48hs.
 */
export function NoraPrediccionesPanel() {
  const [data, setData] = useState<Predictions | null>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState(false)

  async function load() {
    setBusy(true)
    setError(false)
    try {
      const r = await fetch('/api/nora/predictions', { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) throw new Error()
      setData({
        resumen: typeof j?.resumen === 'string' ? j.resumen : '',
        predicciones: Array.isArray(j?.predicciones) ? j.predicciones : [],
      })
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const preds = data?.predicciones ?? []

  return (
    <section
      aria-label="Predicciones de NORA"
      className="rounded-xl bg-[hsl(263_55%_12%)] p-5 text-violet-50 shadow-lg ring-1 ring-white/10"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-violet-200">
          <Zap className="size-3.5 text-[hsl(158_64%_60%)]" />
          Predicciones de NORA · próximas 48hs
        </div>
        <button
          type="button"
          onClick={load}
          disabled={busy}
          aria-label="Recalcular predicciones"
          className="rounded-md p-1 text-violet-200 transition-colors hover:bg-white/10"
        >
          <RefreshCw className={cn('size-3.5', busy && 'animate-spin')} />
        </button>
      </div>

      {busy && !data ? (
        <p className="text-sm text-violet-200/80">NORA está mirando hacia adelante…</p>
      ) : error ? (
        <p className="text-sm text-violet-200/80">
          No pude calcular las predicciones ahora.
        </p>
      ) : preds.length === 0 ? (
        <p className="text-sm text-violet-100/90">
          {data?.resumen ||
            'NORA no detectó eventos relevantes para las próximas 48 horas.'}
        </p>
      ) : (
        <>
          {data?.resumen && (
            <p className="mb-3 text-sm text-violet-100/90">{data.resumen}</p>
          )}
          <ul className="space-y-2.5">
            {preds.slice(0, 3).map((p, i) => (
              <li key={i} className="flex gap-2.5">
                <span
                  className={cn('mt-1.5 size-2 shrink-0 rounded-full', SEV_DOT[p.severidad])}
                  aria-hidden
                />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-white">{p.titulo}</div>
                  <div className="text-xs text-violet-200/80">{p.detalle}</div>
                  {p.accion && (
                    <div className="mt-0.5 text-xs text-[hsl(158_64%_70%)]">
                      → {p.accion}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
