'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import {
  Bot,
  Loader2,
  Send,
  Sparkles,
  X,
  Wrench,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { quickCommandsForPath } from '@/components/ai/quick-commands'

type ChatMessage = { role: 'user' | 'assistant'; content: string }

type StreamEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool_start'; name: string; label: string }
  | { type: 'done'; conversationId: string | null }
  | { type: 'error'; message: string }

export function AiChatDock() {
  const pathname = usePathname() || ''
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [toolStatus, setToolStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const conversationId = useRef<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const quickCommands = quickCommandsForPath(pathname)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, toolStatus, streaming])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  async function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed || streaming) return
    setError(null)
    setInput('')
    const nextMessages: ChatMessage[] = [
      ...messages,
      { role: 'user', content: trimmed },
      { role: 'assistant', content: '' },
    ]
    setMessages(nextMessages)
    setStreaming(true)

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages
            .slice(0, -1)
            .map((m) => ({ role: m.role, content: m.content })),
          ruta: pathname,
          conversationId: conversationId.current,
        }),
      })
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => null)
        throw new Error(j?.error || `Error ${res.status}`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.trim()) continue
          let evt: StreamEvent
          try {
            evt = JSON.parse(line)
          } catch {
            continue
          }
          if (evt.type === 'text') {
            setToolStatus(null)
            setMessages((arr) => {
              const copy = [...arr]
              const last = copy[copy.length - 1]
              if (last?.role === 'assistant') {
                copy[copy.length - 1] = {
                  ...last,
                  content: last.content + evt.delta,
                }
              }
              return copy
            })
          } else if (evt.type === 'tool_start') {
            setToolStatus(evt.label)
          } else if (evt.type === 'done') {
            conversationId.current = evt.conversationId
          } else if (evt.type === 'error') {
            setError(evt.message)
          }
        }
      }
    } catch (e: any) {
      setError(e?.message || 'No se pudo conectar con la IA.')
    } finally {
      setStreaming(false)
      setToolStatus(null)
      setMessages((arr) => {
        const copy = [...arr]
        const last = copy[copy.length - 1]
        if (last?.role === 'assistant' && !last.content.trim()) {
          copy.pop()
        }
        return copy
      })
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    send(input)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(input)
    }
  }

  function reset() {
    setMessages([])
    setError(null)
    conversationId.current = null
  }

  return (
    <>
      {/* Botón flotante */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Cerrar NORA' : 'Abrir NORA'}
        className={cn(
          'fixed bottom-4 right-4 z-40 flex size-12 items-center justify-center rounded-full shadow-lg transition-all',
          'bg-primary text-primary-foreground hover:scale-105 active:scale-95',
          open && 'rotate-90',
        )}
      >
        {open ? <X className="size-5" /> : <Sparkles className="size-5" />}
      </button>

      {/* Panel */}
      {open && (
        <div
          role="dialog"
          aria-label="NORA · Asistente"
          className={cn(
            'fixed z-40 flex flex-col overflow-hidden border border-border bg-card shadow-2xl',
            'inset-x-0 bottom-0 top-14 rounded-none',
            'sm:inset-auto sm:bottom-20 sm:right-4 sm:h-[600px] sm:max-h-[calc(100vh-6rem)] sm:w-[400px] sm:rounded-xl',
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Bot className="size-4" />
              </div>
              <div>
                <div className="text-sm font-semibold leading-none">NORA</div>
                <div className="mt-0.5 text-[10px] text-muted-foreground">
                  NORA HQ · datos en vivo
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={reset}
                  disabled={streaming}
                  className="h-7 text-xs"
                >
                  Nuevo
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setOpen(false)}
                aria-label="Cerrar"
                className="size-7"
              >
                <X className="size-4" />
              </Button>
            </div>
          </div>

          {/* Mensajes */}
          <div
            ref={scrollRef}
            className="flex-1 space-y-3 overflow-y-auto p-4"
          >
            {messages.length === 0 && (
              <div className="space-y-3">
                <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                  Hola, soy NORA, tu asistente de NORA HQ. ¿En qué te
                  ayudo? Puedo consultar tareas, pedidos, ventas, finanzas o
                  stock con datos en vivo.
                </div>
                <div className="space-y-1.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Sugerencias
                  </div>
                  {quickCommands.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => send(q)}
                      className="flex w-full items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-left text-xs transition-colors hover:border-primary/40 hover:bg-accent/40"
                    >
                      <Sparkles className="size-3 shrink-0 text-primary" />
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  'flex',
                  m.role === 'user' ? 'justify-end' : 'justify-start',
                )}
              >
                <div
                  className={cn(
                    'max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm',
                    m.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-foreground',
                  )}
                >
                  {m.content || (
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <Loader2 className="size-3 animate-spin" />
                      Pensando…
                    </span>
                  )}
                </div>
              </div>
            ))}

            {toolStatus && (
              <div className="flex justify-start">
                <div className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                  <Wrench className="size-3 animate-pulse" />
                  {toolStatus}…
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </div>
            )}
          </div>

          {/* Input */}
          <form
            onSubmit={handleSubmit}
            className="border-t border-border bg-background p-3"
          >
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Preguntá algo…"
                rows={1}
                disabled={streaming}
                className="max-h-32 min-h-[40px] flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
              />
              <Button
                type="submit"
                size="icon"
                disabled={streaming || !input.trim()}
                aria-label="Enviar"
                className="size-10 shrink-0"
              >
                {streaming ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
              </Button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
