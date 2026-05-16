import { History } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { TareaHistorialEntry } from '@/lib/types/tareas'
import { HISTORIAL_LABELS } from '@/lib/constants/tareas'
import type { UserMap } from '@/components/tareas/task-comments'

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min}m`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h}h`
  const d = Math.floor(h / 24)
  return `hace ${d}d`
}

export function TaskHistoryTimeline({
  entries,
  users,
}: {
  entries: TareaHistorialEntry[]
  users: UserMap
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          <History className="size-3.5" />
          Historial
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {entries.length === 0 ? (
          <div className="px-4 pb-4 text-sm text-muted-foreground">
            Sin actividad registrada.
          </div>
        ) : (
          <ul className="space-y-3 px-4 pb-4">
            {entries.map((h) => {
              const u = h.user_id
                ? users[h.user_id]?.nombre || users[h.user_id]?.email
                : 'Sistema'
              return (
                <li key={h.id} className="flex gap-3 text-xs">
                  <span
                    className="mt-1 size-2 shrink-0 rounded-full bg-primary/60"
                    aria-hidden
                  />
                  <div className="flex-1">
                    <span className="font-medium text-foreground">{u}</span>{' '}
                    <span className="text-muted-foreground">
                      {HISTORIAL_LABELS[h.accion]}
                    </span>
                    <div className="mt-0.5 text-[10px] text-muted-foreground">
                      {timeAgo(h.created_at)}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
