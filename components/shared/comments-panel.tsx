'use client'

import * as React from 'react'
import { Pencil, Trash2, X, Check, AtSign } from 'lucide-react'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { EmptyState } from '@/components/feedback/empty-state'
import { formatRelativeDate } from '@/lib/utils/format'
import { cn } from '@/lib/utils'

/* ---------- types ---------- */

export type CommentMention = {
  id: string
  name: string
}

export type Comment = {
  id: string
  authorId: string
  authorName: string
  authorAvatarUrl?: string | null
  body: string
  /** ISO timestamp. */
  createdAt: string
  /** Si está seteado, fue editado en `updatedAt`. */
  updatedAt?: string | null
  /** Menciones extraídas del body. */
  mentions?: CommentMention[]
}

export type MentionableUser = {
  id: string
  name: string
}

export interface CommentsPanelProps {
  comments: Comment[]
  currentUserId: string
  /** Para autocomplete de @menciones. Si vacío, no hay autocomplete. */
  mentionableUsers?: MentionableUser[]
  loading?: boolean
  /** Callback al postear un comentario nuevo. */
  onSubmit?: (body: string, mentions: CommentMention[]) => Promise<void> | void
  onEdit?: (id: string, body: string, mentions: CommentMention[]) => Promise<void> | void
  onDelete?: (id: string) => Promise<void> | void
  className?: string
}

/* ---------- helpers ---------- */

function initialsFor(name: string): string {
  const parts = name.split(/[\s.@]+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase()
  return (parts[0]!.charAt(0) + parts[1]!.charAt(0)).toUpperCase()
}

/**
 * Renderiza un cuerpo de comentario detectando @menciones (`@id`) y
 * reemplazándolas por chips.
 */
function renderBody(body: string, mentions: CommentMention[] = []): React.ReactNode {
  if (mentions.length === 0) return body
  // El body se asume con menciones inline tipo "@id"; resolvemos por id.
  const tokens: React.ReactNode[] = []
  const regex = /@([a-zA-Z0-9_-]+)/g
  let last = 0
  let m: RegExpExecArray | null
  let key = 0
  while ((m = regex.exec(body))) {
    const before = body.slice(last, m.index)
    if (before) tokens.push(before)
    const ref = mentions.find((x) => x.id === m![1])
    if (ref) {
      tokens.push(
        <span
          key={`mention-${key++}`}
          className="rounded bg-secondary/15 px-1 text-secondary"
        >
          @{ref.name}
        </span>,
      )
    } else {
      tokens.push(m[0])
    }
    last = m.index + m[0].length
  }
  const after = body.slice(last)
  if (after) tokens.push(after)
  return tokens
}

/* ---------- component ---------- */

/**
 * Panel de comentarios timeline (más reciente arriba) con editor sticky
 * abajo y soporte para @menciones.
 *
 * **T-D**: este componente es UI shell — recibe `comments` y los
 * callbacks; no consulta Supabase. Cuando llegue el módulo (ej:
 * facturas) se crea la tabla `comentarios_admin` y se enchufa.
 *
 * @example
 *   <CommentsPanel
 *     comments={comments}
 *     currentUserId={user.id}
 *     mentionableUsers={users}
 *     onSubmit={(body, mentions) => saveComment(body, mentions)}
 *     onDelete={(id) => deleteComment(id)}
 *     onEdit={(id, body, mentions) => updateComment(id, body, mentions)}
 *   />
 */
export function CommentsPanel({
  comments,
  currentUserId,
  mentionableUsers = [],
  loading = false,
  onSubmit,
  onEdit,
  onDelete,
  className,
}: CommentsPanelProps) {
  const sorted = React.useMemo(
    () => [...comments].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [comments],
  )

  const [draft, setDraft] = React.useState('')
  const [draftMentions, setDraftMentions] = React.useState<CommentMention[]>([])
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [editBody, setEditBody] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)

  function addMention(u: MentionableUser, target: 'draft' | 'edit') {
    const token = `@${u.id} `
    if (target === 'draft') {
      setDraft((d) => (d.endsWith(' ') || d === '' ? d + token : d + ' ' + token))
      if (!draftMentions.find((m) => m.id === u.id))
        setDraftMentions((arr) => [...arr, { id: u.id, name: u.name }])
    } else {
      setEditBody((d) => (d.endsWith(' ') || d === '' ? d + token : d + ' ' + token))
    }
  }

  async function handleSubmit() {
    const body = draft.trim()
    if (!body || !onSubmit) return
    setSubmitting(true)
    try {
      await onSubmit(body, draftMentions)
      setDraft('')
      setDraftMentions([])
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSaveEdit(c: Comment) {
    const body = editBody.trim()
    if (!body || !onEdit) {
      setEditingId(null)
      return
    }
    await onEdit(c.id, body, c.mentions ?? [])
    setEditingId(null)
  }

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <ul className="flex flex-col gap-3">
        {sorted.map((c) => (
          <li
            key={c.id}
            className="flex gap-3 rounded-md border border-border bg-card p-3"
          >
            <Avatar className="size-8 shrink-0">
              <AvatarFallback className="bg-secondary text-[11px] font-bold text-secondary-foreground">
                {initialsFor(c.authorName)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-semibold">{c.authorName}</span>
                <span className="text-[11px] text-muted-foreground">
                  {formatRelativeDate(c.createdAt)}
                  {c.updatedAt && (
                    <span className="ml-1 italic">(editado)</span>
                  )}
                </span>
              </div>

              {editingId === c.id ? (
                <div className="mt-2 space-y-2">
                  <Textarea
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    rows={3}
                    autoFocus
                  />
                  <div className="flex items-center justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                      <X className="size-3.5" /> Cancelar
                    </Button>
                    <Button size="sm" onClick={() => handleSaveEdit(c)}>
                      <Check className="size-3.5" /> Guardar
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
                  {renderBody(c.body, c.mentions ?? [])}
                </p>
              )}
            </div>

            {c.authorId === currentUserId && editingId !== c.id && (
              <div className="flex shrink-0 items-start gap-1">
                {onEdit && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-muted-foreground hover:text-foreground"
                    aria-label="Editar comentario"
                    onClick={() => {
                      setEditingId(c.id)
                      setEditBody(c.body)
                    }}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                )}
                {onDelete && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-muted-foreground hover:text-destructive"
                    aria-label="Borrar comentario"
                    onClick={() => onDelete(c.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </div>
            )}
          </li>
        ))}

        {!loading && sorted.length === 0 && (
          <li>
            <EmptyState
              title="Aún no hay comentarios"
              description="Sé el primero en comentar."
            />
          </li>
        )}
      </ul>

      {onSubmit && (
        <div className="sticky bottom-0 -mx-1 flex flex-col gap-2 rounded-md border border-border bg-background p-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Escribí un comentario… usá @ para mencionar."
            rows={3}
            disabled={submitting}
          />
          <div className="flex items-center justify-between gap-2">
            {mentionableUsers.length > 0 ? (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground">
                    <AtSign className="size-3" />
                    Mencionar
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-60 p-1">
                  <div className="max-h-60 overflow-y-auto">
                    {mentionableUsers.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
                        onClick={() => addMention(u, 'draft')}
                      >
                        <Avatar className="size-6">
                          <AvatarFallback className="bg-secondary text-[10px] font-bold text-secondary-foreground">
                            {initialsFor(u.name)}
                          </AvatarFallback>
                        </Avatar>
                        <span>{u.name}</span>
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            ) : (
              <span className="text-xs text-muted-foreground">
                Cmd+Enter para enviar
              </span>
            )}
            <Button
              size="sm"
              disabled={!draft.trim() || submitting}
              onClick={handleSubmit}
            >
              {submitting ? 'Publicando…' : 'Comentar'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
