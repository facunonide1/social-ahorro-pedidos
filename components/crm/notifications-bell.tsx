'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, BellRing, CheckCheck } from 'lucide-react'

import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import type { AdminRole, NotificacionPrioridad, NotificacionTipo } from '@/lib/types/admin'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import type { CrmRole } from '@/components/crm/crm-nav-config'

type Notificacion = {
  id: string
  tipo: NotificacionTipo
  titulo: string
  mensaje: string | null
  entidad_relacionada: string | null
  entidad_id: string | null
  leida: boolean
  url_accion: string | null
  prioridad: NotificacionPrioridad
  created_at: string
}

const PRIORIDAD_DOT: Record<NotificacionPrioridad, string> = {
  baja: 'bg-muted-foreground',
  media: 'bg-info',
  alta: 'bg-warning',
  critica: 'bg-destructive',
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min}m`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h}h`
  const d = Math.floor(h / 24)
  return `hace ${d}d`
}

export function NotificationsBell({
  userId,
  role: _crmRole,
  adminRole,
}: {
  userId: string
  role?: CrmRole
  adminRole?: AdminRole
}) {
  const router = useRouter()
  const sb = createClient()
  const [items, setItems] = useState<Notificacion[]>([])
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const unreadCount = items.filter((n) => !n.leida).length

  async function fetchNotifs() {
    let query = sb
      .from('notificaciones_admin')
      .select(
        'id, tipo, titulo, mensaje, entidad_relacionada, entidad_id, leida, url_accion, prioridad, created_at',
      )
      .order('created_at', { ascending: false })
      .limit(30)

    if (adminRole) {
      query = query.or(`user_id.eq.${userId},rol_destinatario.eq.${adminRole}`)
    } else {
      query = query.eq('user_id', userId)
    }
    const { data } = await query
    setItems((data ?? []) as Notificacion[])
    setLoaded(true)
  }

  useEffect(() => {
    fetchNotifs()
    const channel = sb
      .channel(`notif-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notificaciones_admin',
          filter: `user_id=eq.${userId}`,
        },
        () => fetchNotifs(),
      )
      .subscribe()
    return () => {
      sb.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, adminRole])

  async function marcarLeida(n: Notificacion) {
    if (n.leida) return
    await sb
      .from('notificaciones_admin')
      .update({ leida: true, read_at: new Date().toISOString() })
      .eq('id', n.id)
    setItems((arr) =>
      arr.map((x) => (x.id === n.id ? { ...x, leida: true } : x)),
    )
  }

  async function marcarTodasLeidas() {
    const ids = items.filter((n) => !n.leida).map((n) => n.id)
    if (ids.length === 0) return
    await sb
      .from('notificaciones_admin')
      .update({ leida: true, read_at: new Date().toISOString() })
      .in('id', ids)
    setItems((arr) => arr.map((x) => ({ ...x, leida: true })))
  }

  function handleClick(n: Notificacion) {
    marcarLeida(n)
    setOpen(false)
    if (n.url_accion) router.push(n.url_accion)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative size-9"
          aria-label={`Notificaciones${unreadCount > 0 ? ` (${unreadCount} sin leer)` : ''}`}
        >
          {unreadCount > 0 ? <BellRing className="size-4" /> : <Bell className="size-4" />}
          {unreadCount > 0 && (
            <span className="absolute right-1 top-1 inline-flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold leading-none text-destructive-foreground">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border p-3">
          <div className="text-sm font-semibold">Notificaciones</div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={marcarTodasLeidas}
              className="h-7 gap-1 text-xs"
            >
              <CheckCheck className="size-3.5" />
              Marcar todas
            </Button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {!loaded && (
            <div className="p-6 text-center text-xs text-muted-foreground">
              Cargando…
            </div>
          )}
          {loaded && items.length === 0 && (
            <div className="p-6 text-center text-xs text-muted-foreground">
              Sin notificaciones.
            </div>
          )}
          {items.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => handleClick(n)}
              className={cn(
                'flex w-full gap-2.5 border-b border-border/60 p-3 text-left transition-colors hover:bg-accent/40',
                !n.leida && 'bg-primary/5',
              )}
            >
              <span
                className={cn(
                  'mt-1 size-2 shrink-0 rounded-full',
                  PRIORIDAD_DOT[n.prioridad],
                  n.leida && 'opacity-30',
                )}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div
                    className={cn(
                      'truncate text-sm',
                      !n.leida ? 'font-semibold' : 'font-medium text-muted-foreground',
                    )}
                  >
                    {n.titulo}
                  </div>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {relativeTime(n.created_at)}
                  </span>
                </div>
                {n.mensaje && (
                  <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {n.mensaje}
                  </div>
                )}
                {n.url_accion && (
                  <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-medium text-primary">
                    Abrir →
                  </div>
                )}
              </div>
              {!n.leida && (
                <Badge variant="secondary" className="shrink-0 self-start text-[9px]">
                  nuevo
                </Badge>
              )}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
