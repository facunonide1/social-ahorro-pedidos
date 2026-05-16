import Link from 'next/link'
import { ArrowRight, ListChecks } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { TareaConTipo } from '@/lib/types/tareas'
import {
  SlaIndicator,
  TaskPriorityBadge,
  TaskStatusBadge,
} from '@/components/tareas/task-badges'
import { TAREA_CATEGORIA_LABELS } from '@/lib/constants/tareas'

export function TaskCard({
  tarea,
  href,
  responsableNombre,
  className,
}: {
  tarea: TareaConTipo
  href?: string
  responsableNombre?: string | null
  className?: string
}) {
  const tipo = tarea.tipo
  const url = href ?? `/admin/tareas/${tarea.id}`
  const colorBar = tipo?.color ?? '#94a3b8'

  return (
    <Link href={url} className="group block">
      <Card
        className={cn(
          'relative overflow-hidden transition-colors hover:border-primary/40 hover:bg-accent/30',
          className,
        )}
      >
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-1"
          style={{ background: colorBar }}
        />
        <CardContent className="space-y-2 p-3 pl-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                <ListChecks className="size-3" />
                <span>{tarea.codigo}</span>
                {tipo && (
                  <>
                    <span>·</span>
                    <span>{TAREA_CATEGORIA_LABELS[tipo.categoria]}</span>
                  </>
                )}
              </div>
              <div className="mt-0.5 truncate text-sm font-semibold">
                {tarea.titulo}
              </div>
            </div>
            <TaskPriorityBadge prioridad={tarea.prioridad} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <TaskStatusBadge estado={tarea.estado} />
            <SlaIndicator fechaVencimiento={tarea.fecha_vencimiento} />
          </div>

          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="truncate">
              {responsableNombre || 'Sin responsable asignado'}
            </span>
            <ArrowRight className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
