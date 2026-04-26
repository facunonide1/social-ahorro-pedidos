import { create } from 'zustand'
import { createClient } from '@/lib/supabase/client'
import type {
  NotificacionTipo,
  NotificacionPrioridad,
} from '@/lib/types/admin'

/**
 * Notificación tal como la consume la UI. Es un mirror reducido de
 * `notificaciones_admin` en Supabase (creada en migración 0016).
 */
export type Notification = {
  id: string
  tipo: NotificacionTipo
  titulo: string
  mensaje: string | null
  prioridad: NotificacionPrioridad
  leida: boolean
  url_accion: string | null
  entidad_relacionada: string | null
  entidad_id: string | null
  created_at: string
}

type NotificationsState = {
  notifications: Notification[]
  unreadCount: number
  isSubscribed: boolean
  isLoading: boolean

  subscribe: (userId: string) => Promise<void>
  unsubscribe: () => void
  markAsRead: (id: string) => Promise<void>
  markAllAsRead: () => Promise<void>
  pushLocal: (n: Notification) => void
  clear: () => void
}

let channelRef: ReturnType<ReturnType<typeof createClient>['channel']> | null = null

function recomputeUnread(list: Notification[]): number {
  return list.reduce((acc, n) => acc + (n.leida ? 0 : 1), 0)
}

function rowToNotif(row: any): Notification {
  return {
    id: row.id,
    tipo: row.tipo,
    titulo: row.titulo,
    mensaje: row.mensaje ?? null,
    prioridad: row.prioridad,
    leida: !!row.leida,
    url_accion: row.url_accion ?? null,
    entidad_relacionada: row.entidad_relacionada ?? null,
    entidad_id: row.entidad_id ?? null,
    created_at: row.created_at,
  }
}

/**
 * Store de notificaciones con suscripción a Supabase Realtime.
 *
 * Carga inicial: lee últimas 50 notificaciones del usuario al
 * suscribirse. Después escucha INSERT/UPDATE en `notificaciones_admin`
 * filtrado por `user_id` y mantiene la lista en memoria.
 */
export const useNotificationsStore = create<NotificationsState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isSubscribed: false,
  isLoading: false,

  subscribe: async (userId: string) => {
    if (get().isSubscribed) return

    const sb = createClient()
    set({ isLoading: true })

    // Carga inicial
    const { data } = await sb
      .from('notificaciones_admin')
      .select('id, tipo, titulo, mensaje, prioridad, leida, url_accion, entidad_relacionada, entidad_id, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50)

    const initial = (data ?? []).map(rowToNotif)
    set({
      notifications: initial,
      unreadCount: recomputeUnread(initial),
      isLoading: false,
    })

    // Suscripción realtime
    if (channelRef) {
      try { sb.removeChannel(channelRef) } catch { /* noop */ }
      channelRef = null
    }
    channelRef = sb
      .channel(`notificaciones_admin:${userId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notificaciones_admin', filter: `user_id=eq.${userId}` },
        (payload) => {
          const n = rowToNotif(payload.new)
          const list = [n, ...get().notifications].slice(0, 100)
          set({ notifications: list, unreadCount: recomputeUnread(list) })
        },
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notificaciones_admin', filter: `user_id=eq.${userId}` },
        (payload) => {
          const updated = rowToNotif(payload.new)
          const list = get().notifications.map((n) => (n.id === updated.id ? updated : n))
          set({ notifications: list, unreadCount: recomputeUnread(list) })
        },
      )
      .subscribe()

    set({ isSubscribed: true })
  },

  unsubscribe: () => {
    if (channelRef) {
      const sb = createClient()
      try { sb.removeChannel(channelRef) } catch { /* noop */ }
      channelRef = null
    }
    set({ isSubscribed: false })
  },

  markAsRead: async (id: string) => {
    set((s) => {
      const list = s.notifications.map((n) => (n.id === id ? { ...n, leida: true } : n))
      return { notifications: list, unreadCount: recomputeUnread(list) }
    })
    const sb = createClient()
    await sb.from('notificaciones_admin').update({ leida: true, read_at: new Date().toISOString() }).eq('id', id)
  },

  markAllAsRead: async () => {
    const ids = get().notifications.filter((n) => !n.leida).map((n) => n.id)
    if (ids.length === 0) return
    set((s) => {
      const list = s.notifications.map((n) => ({ ...n, leida: true }))
      return { notifications: list, unreadCount: 0 }
    })
    const sb = createClient()
    await sb.from('notificaciones_admin').update({ leida: true, read_at: new Date().toISOString() }).in('id', ids)
  },

  pushLocal: (n) =>
    set((s) => {
      const list = [n, ...s.notifications].slice(0, 100)
      return { notifications: list, unreadCount: recomputeUnread(list) }
    }),

  clear: () => set({ notifications: [], unreadCount: 0 }),
}))
