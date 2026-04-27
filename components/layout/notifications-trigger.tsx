'use client'

import { Bell } from 'lucide-react'
import { useNotificationsStore } from '@/lib/stores/notifications-store'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover'

/**
 * Trigger placeholder de notificaciones.
 *
 * TODO T-G: integrar NotificationsPopover real con tabs (Todas / No
 * leídas / Tareas / Aprobaciones), iconos por tipo, "marcar todas
 * como leídas", links a la entidad relacionada.
 */
export function NotificationsTrigger() {
  const unreadCount = useNotificationsStore((s) => s.unreadCount)

  return (
    <Popover>
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
            <span className="text-xs text-muted-foreground">{unreadCount} sin leer</span>
          )}
        </div>
        <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
          <Bell className="size-8 text-muted-foreground/40" aria-hidden />
          <div className="text-sm font-medium">Próximamente</div>
          <p className="max-w-[18rem] text-xs text-muted-foreground">
            En esta vista vas a tener tus notificaciones del ERP en
            tiempo real (alertas, tareas, aprobaciones).
          </p>
        </div>
      </PopoverContent>
    </Popover>
  )
}
