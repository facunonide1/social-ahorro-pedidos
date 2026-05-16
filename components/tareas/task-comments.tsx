'use client'

import { useState } from 'react'
import { Loader2, MessageSquare, Send } from 'lucide-react'
import { toast } from 'sonner'

import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import type { TareaComentario } from '@/lib/types/tareas'
import { TAREA_ESTADO_LABELS } from '@/lib/constants/tareas'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { EmpleadoAvatar } from '@/components/empleados/empleado-avatar'

export type UserMap = Record<string, { nombre: string | null; email: string }>

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

function nombreDe(uid: string, users: UserMap): string {
  const u = users[uid]
  return u?.nombre || u?.email || uid.slice(0, 8)
}

export function TaskComments({
  tareaId,
  initial,
  users,
  currentUserId,
}: {
  tareaId: string
  initial: TareaComentario[]
  users: UserMap
  currentUserId: string
}) {
  const sb = createClient()
  const [comentarios, setComentarios] = useState(initial)
  const [texto, setTexto] = useState('')
  const [busy, setBusy] = useState(false)

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    const contenido = texto.trim()
    if (!contenido) return
    setBusy(true)
    const menciones = Array.from(contenido.matchAll(/@([a-f0-9-]{36})/g)).map(
      (m) => m[1],
    )
    const { data, error } = await sb
      .from('tareas_comentarios')
      .insert({
        tarea_id: tareaId,
        user_id: currentUserId,
        contenido,
        menciones,
      })
      .select('*')
      .maybeSingle<TareaComentario>()
    setBusy(false)
    if (error || !data) {
      toast.error(error?.message || 'No se pudo publicar el comentario.')
      return
    }
    setComentarios((arr) => [...arr, data])
    setTexto('')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          <MessageSquare className="size-3.5" />
          Comentarios ({comentarios.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {comentarios.length === 0 && (
          <div className="py-2 text-sm text-muted-foreground">
            Sin comentarios todavía.
          </div>
        )}
        <ul className="space-y-3">
          {comentarios.map((c) => (
            <li key={c.id} className="flex gap-2.5">
              <EmpleadoAvatar
                size="sm"
                nombre={nombreDe(c.user_id, users)}
              />
              <div
                className={cn(
                  'min-w-0 flex-1 rounded-lg px-3 py-2',
                  c.es_cambio_estado
                    ? 'bg-muted/40 text-muted-foreground'
                    : 'bg-muted/60',
                )}
              >
                <div className="flex items-baseline gap-2 text-xs">
                  <span className="font-semibold text-foreground">
                    {nombreDe(c.user_id, users)}
                  </span>
                  <span className="text-muted-foreground">
                    {timeAgo(c.created_at)}
                  </span>
                  {c.es_cambio_estado && c.estado_nuevo && (
                    <span className="text-[10px] font-medium uppercase tracking-wider text-info">
                      → {TAREA_ESTADO_LABELS[c.estado_nuevo as never] ?? c.estado_nuevo}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 whitespace-pre-wrap text-sm text-foreground">
                  {renderConMenciones(c.contenido, users)}
                </p>
              </div>
            </li>
          ))}
        </ul>

        <form onSubmit={enviar} className="space-y-2 border-t border-border pt-3">
          <Textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={2}
            placeholder="Escribí un comentario… usá @uuid para mencionar"
            disabled={busy}
          />
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={busy || !texto.trim()}>
              {busy ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Send className="size-3.5" />
              )}
              Publicar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

/** Resaltado de menciones @<uuid> a "@<nombre>". */
function renderConMenciones(contenido: string, users: UserMap): React.ReactNode {
  const partes = contenido.split(/(@[a-f0-9-]{36})/g)
  return partes.map((p, i) => {
    const m = p.match(/^@([a-f0-9-]{36})$/)
    if (!m) return <span key={i}>{p}</span>
    return (
      <span
        key={i}
        className="rounded bg-primary/10 px-1 font-medium text-primary"
      >
        @{nombreDe(m[1], users)}
      </span>
    )
  })
}
