'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell } from 'lucide-react'
import { useNotificationsStore, type Notification } from '@/lib/stores/notifications-store'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover'

/** «hace 5 min», «hace 3 h», «12/11». */
function hace(iso: string): string {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 90) return 'recién'
  if (s < 3600) return `hace ${Math.round(s / 60)} min`
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
}

const COLOR_PRIORIDAD: Record<string, string> = {
  critica: 'bg-destructive', alta: 'bg-amber-500', media: 'bg-primary', baja: 'bg-muted-foreground/40',
}

/**
 * Las notificaciones del usuario (`notificaciones_admin`). El store ya las
 * carga (las últimas 50) y escucha las nuevas por Realtime; antes el popover
 * decía «Próximamente» aunque el contador de arriba ya contaba de verdad.
 */
export function NotificationsTrigger() {
  const unreadCount = useNotificationsStore((s) => s.unreadCount)
  const notifications = useNotificationsStore((s) => s.notifications)
  const isLoading = useNotificationsStore((s) => s.isLoading)
  const markAsRead = useNotificationsStore((s) => s.markAsRead)
  const markAllAsRead = useNotificationsStore((s) => s.markAllAsRead)
  const router = useRouter()
  const [open, setOpen] = useState(false)

  function abrir(n: Notification) {
    if (!n.leida) void markAsRead(n.id)
    if (n.url_accion) {
      setOpen(false)
      router.push(n.url_accion)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9"
          aria-label={
            unreadCount > 0
              ? `${unreadCount} notificaciones sin leer`
              : 'Notificaciones'
          }
        >
          <Bell className="size-4" />
          {unreadCount > 0 && (
            <span className="absolute right-1 top-1 flex min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="text-sm font-semibold">Notificaciones</div>
          {unreadCount > 0 && (
            <button type="button" onClick={() => void markAllAsRead()} className="text-xs text-primary hover:underline">
              Marcar todas como leídas
            </button>
          )}
        </div>
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
            <Bell className="size-8 text-muted-foreground/40" aria-hidden />
            <div className="text-sm font-medium">{isLoading ? 'Cargando…' : 'No tenés notificaciones'}</div>
            {!isLoading && (
              <p className="max-w-[18rem] text-xs text-muted-foreground">
                Acá llegan las alertas, tareas y aprobaciones que te tocan.
              </p>
            )}
          </div>
        ) : (
          <ul className="max-h-96 overflow-y-auto">
            {notifications.map((n) => (
              <li key={n.id} className="border-b border-border last:border-0">
                <button
                  type="button"
                  onClick={() => abrir(n)}
                  className={cn('flex w-full gap-3 px-4 py-3 text-left hover:bg-accent', !n.leida && 'bg-primary/5')}
                >
                  <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.leida ? 'bg-transparent' : (COLOR_PRIORIDAD[n.prioridad] ?? 'bg-primary'))} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className={cn('block text-sm', !n.leida && 'font-medium')}>{n.titulo}</span>
                    {n.mensaje && <span className="block truncate text-xs text-muted-foreground">{n.mensaje}</span>}
                    <span className="block text-[11px] text-muted-foreground">{hace(n.created_at)}{!n.leida && <span className="sr-only"> · sin leer</span>}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  )
}
