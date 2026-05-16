import { Trophy } from 'lucide-react'
import { cn } from '@/lib/utils'

const NIVELES = [
  { umbral: 0,    nombre: 'Iniciando',   color: 'bg-slate-400' },
  { umbral: 50,   nombre: 'Bronce',      color: 'bg-amber-700' },
  { umbral: 200,  nombre: 'Plata',       color: 'bg-zinc-400' },
  { umbral: 500,  nombre: 'Oro',         color: 'bg-amber-500' },
  { umbral: 1500, nombre: 'Platino',     color: 'bg-cyan-400' },
  { umbral: 4000, nombre: 'Diamante',    color: 'bg-violet-500' },
  { umbral: 10000,nombre: 'Leyenda',     color: 'bg-rose-500' },
]

function nivelDeScore(score: number) {
  let actual = NIVELES[0]
  let siguiente = NIVELES[1]
  for (let i = 0; i < NIVELES.length; i++) {
    if (score >= NIVELES[i].umbral) {
      actual = NIVELES[i]
      siguiente = NIVELES[i + 1] ?? NIVELES[i]
    }
  }
  return { actual, siguiente }
}

/** Barra de progreso de score con nivel actual + próximo. */
export function ScoreProgress({
  score,
  className,
}: {
  score: number
  className?: string
}) {
  const { actual, siguiente } = nivelDeScore(score)
  const enUltimoNivel = actual.umbral === siguiente.umbral
  const rango = siguiente.umbral - actual.umbral
  const avance = enUltimoNivel ? 1 : (score - actual.umbral) / rango
  const pct = Math.min(100, Math.max(0, avance * 100))

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-center justify-between text-xs">
        <span className="inline-flex items-center gap-1.5 font-semibold">
          <Trophy className="size-3.5 text-warning" />
          {actual.nombre}
        </span>
        <span className="tabular-nums text-muted-foreground">
          {score.toLocaleString('es-AR')} pts
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full transition-all', actual.color)}
          style={{ width: `${pct}%` }}
        />
      </div>
      {!enUltimoNivel && (
        <div className="text-[10px] text-muted-foreground">
          {(siguiente.umbral - score).toLocaleString('es-AR')} pts hasta{' '}
          <span className="font-medium">{siguiente.nombre}</span>
        </div>
      )}
    </div>
  )
}
