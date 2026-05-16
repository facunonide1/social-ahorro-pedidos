import { Check, ChevronRight } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { TareaEstado } from '@/lib/types/tareas'

type Step = {
  key: string
  label: string
  estado: 'completado' | 'actual' | 'pendiente' | 'rechazado'
}

/**
 * Stepper visual del workflow multi-nivel.
 *
 * Muestra hasta 3 pasos según el nivel del tipo de tarea:
 *  Nivel 1: Ejecución → Completada
 *  Nivel 2: Ejecución → Verificación → Completada
 *  Nivel 3: Ejecución → Verificación → Aprobación → Completada
 */
export function WorkflowStepper({
  estado,
  niveles,
  className,
}: {
  estado: TareaEstado
  niveles: 1 | 2 | 3
  className?: string
}) {
  const steps: Step[] = []

  // Estado de "ejecución" (responsable trabajando)
  steps.push({
    key: 'ejecucion',
    label: 'Ejecución',
    estado: derivStep(estado, ['pendiente', 'asignada', 'en_progreso', 'bloqueada']),
  })

  if (niveles >= 2) {
    steps.push({
      key: 'verificacion',
      label: 'Verificación',
      estado: derivStep(estado, ['en_verificacion'], 'verificacion'),
    })
  }

  if (niveles === 3) {
    steps.push({
      key: 'aprobacion',
      label: 'Aprobación',
      estado: derivStep(estado, ['en_aprobacion'], 'aprobacion'),
    })
  }

  steps.push({
    key: 'completada',
    label: 'Completada',
    estado: estado === 'completada' ? 'completado' : 'pendiente',
  })

  // Si está rechazada/descartada/vencida, marcamos el paso actual como rojo.
  if (
    estado === 'rechazada' ||
    estado === 'descartada' ||
    estado === 'vencida'
  ) {
    const idx = steps.findIndex((s) => s.estado === 'actual')
    if (idx >= 0) steps[idx].estado = 'rechazado'
  }

  return (
    <ol
      className={cn('flex flex-wrap items-center gap-1 text-xs', className)}
      aria-label="Workflow"
    >
      {steps.map((s, i) => (
        <li key={s.key} className="flex items-center gap-1">
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium',
              s.estado === 'completado' &&
                'bg-success/15 text-success',
              s.estado === 'actual' &&
                'bg-warning/15 text-warning ring-1 ring-warning/30',
              s.estado === 'pendiente' &&
                'bg-muted text-muted-foreground',
              s.estado === 'rechazado' &&
                'bg-destructive/15 text-destructive',
            )}
          >
            <span
              className={cn(
                'flex size-4 items-center justify-center rounded-full text-[9px] font-bold',
                s.estado === 'completado'
                  ? 'bg-success text-success-foreground'
                  : s.estado === 'actual'
                    ? 'bg-warning text-warning-foreground'
                    : s.estado === 'rechazado'
                      ? 'bg-destructive text-destructive-foreground'
                      : 'bg-muted-foreground/30 text-foreground',
              )}
              aria-hidden
            >
              {s.estado === 'completado' ? <Check className="size-2.5" /> : i + 1}
            </span>
            {s.label}
          </span>
          {i < steps.length - 1 && (
            <ChevronRight className="size-3 text-muted-foreground" aria-hidden />
          )}
        </li>
      ))}
    </ol>
  )
}

function derivStep(
  estado: TareaEstado,
  estadosCorresponden: TareaEstado[],
  fase?: 'verificacion' | 'aprobacion',
): 'completado' | 'actual' | 'pendiente' {
  if (estado === 'completada') return 'completado'
  if (estadosCorresponden.includes(estado)) return 'actual'
  // Si la tarea ya superó esta fase
  if (fase === 'verificacion' && estado === 'en_aprobacion') return 'completado'
  if (
    !fase &&
    ['en_verificacion', 'en_aprobacion'].includes(estado)
  ) {
    return 'completado'
  }
  return 'pendiente'
}
