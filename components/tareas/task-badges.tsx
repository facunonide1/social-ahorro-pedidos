import { AlertTriangle, Clock, Flag, Lock } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  TAREA_ESTADO_LABELS,
  TAREA_ESTADO_VARIANT,
  TAREA_PRIORIDAD_LABELS,
  TAREA_PRIORIDAD_VARIANT,
} from '@/lib/constants/tareas'
import type { TareaEstado, TareaPrioridad } from '@/lib/types/tareas'

export function TaskStatusBadge({
  estado,
  className,
}: {
  estado: TareaEstado
  className?: string
}) {
  const Icon =
    estado === 'vencida' || estado === 'rechazada'
      ? AlertTriangle
      : estado === 'bloqueada'
        ? Lock
        : null
  return (
    <Badge
      variant={TAREA_ESTADO_VARIANT[estado]}
      className={cn('gap-1 text-[10px]', className)}
    >
      {Icon && <Icon className="size-3" />}
      {TAREA_ESTADO_LABELS[estado]}
    </Badge>
  )
}

export function TaskPriorityBadge({
  prioridad,
  className,
}: {
  prioridad: TareaPrioridad
  className?: string
}) {
  return (
    <Badge
      variant={TAREA_PRIORIDAD_VARIANT[prioridad]}
      className={cn('gap-1 text-[10px]', className)}
    >
      <Flag className="size-3" />
      {TAREA_PRIORIDAD_LABELS[prioridad]}
    </Badge>
  )
}

/** Indicador de SLA: días/horas restantes hasta vencimiento. */
export function SlaIndicator({
  fechaVencimiento,
  className,
}: {
  fechaVencimiento: string | null
  className?: string
}) {
  if (!fechaVencimiento) return null
  const ahora = Date.now()
  const venc = new Date(fechaVencimiento).getTime()
  const diff = venc - ahora
  const horas = Math.round(diff / 36e5)
  const dias = Math.round(diff / 864e5)

  let texto: string
  let tone: 'success' | 'warning' | 'destructive' | 'muted'
  if (diff < 0) {
    texto = `Vencida hace ${formatDistance(-diff)}`
    tone = 'destructive'
  } else if (horas < 24) {
    texto = `Vence en ${horas}h`
    tone = 'warning'
  } else if (dias < 3) {
    texto = `Vence en ${dias}d`
    tone = 'warning'
  } else {
    texto = `Vence en ${dias}d`
    tone = 'muted'
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-[10px] font-medium',
        tone === 'success' && 'text-success',
        tone === 'warning' && 'text-warning',
        tone === 'destructive' && 'text-destructive',
        tone === 'muted' && 'text-muted-foreground',
        className,
      )}
    >
      <Clock className="size-3" />
      {texto}
    </span>
  )
}

function formatDistance(ms: number): string {
  const horas = Math.floor(ms / 36e5)
  if (horas < 24) return `${horas}h`
  const dias = Math.floor(horas / 24)
  return `${dias}d`
}
