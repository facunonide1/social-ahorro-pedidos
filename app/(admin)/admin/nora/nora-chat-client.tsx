'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Send, Loader2, Plus, MessageSquare, Wrench, ShoppingCart, Users, TrendingUp, FileDown } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

type ChatMessage = { role: 'user' | 'assistant'; content: string }
export type ConversacionLite = { id: string; titulo: string; fecha: string; mensajes: ChatMessage[] }
type StreamEvent =
  | { type: 'text'; delta: string } | { type: 'tool_start'; name: string; label: string }
  | { type: 'navigate'; href: string; label: string }
  | { type: 'done'; conversationId: string | null } | { type: 'error'; message: string }

const SUGERENCIAS = [
  { icon: TrendingUp, txt: '¿Cómo viene el día?' },
  { icon: ShoppingCart, txt: '¿Qué tengo que comprar?' },
  { icon: Users, txt: '¿Qué cliente está por irse?' },
  { icon: FileDown, txt: 'Generá el CSV de ofertas para SIFACO' },
]

export function NoraChatClient({ nombre, historial, iaConfigurada }: { nombre: string | null; historial: ConversacionLite[]; iaConfigurada: boolean }) {
  const router = useRouter()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [toolStatus, setToolStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const conversationId = useRef<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight }, [messages, toolStatus])
  useEffect(() => { inputRef.current?.focus() }, [])

  function cargarConv(c: ConversacionLite) {
    setMessages(c.mensajes); conversationId.current = c.id; setError(null)
  }
  function nueva() { setMessages([]); conversationId.current = null; setError(null); inputRef.current?.focus() }

  async function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed || streaming) return
    setError(null); setInput('')
    const next: ChatMessage[] = [...messages, { role: 'user', content: trimmed }, { role: 'assistant', content: '' }]
    setMessages(next); setStreaming(true)
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next.slice(0, -1).map((m) => ({ role: m.role, content: m.content })), ruta: '/admin/nora', conversationId: conversationId.current }),
      })
      if (!res.ok || !res.body) { const j = await res.json().catch(() => null); throw new Error(j?.error || `Error ${res.status}`) }
      const reader = res.body.getReader(); const decoder = new TextDecoder(); let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n'); buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.trim()) continue
          let evt: StreamEvent; try { evt = JSON.parse(line) } catch { continue }
          if (evt.type === 'text') { setToolStatus(null); setMessages((arr) => { const c = [...arr]; const l = c[c.length - 1]; if (l?.role === 'assistant') c[c.length - 1] = { ...l, content: l.content + evt.delta }; return c }) }
          else if (evt.type === 'tool_start') setToolStatus(evt.label)
          else if (evt.type === 'navigate') { const href = evt.href; setTimeout(() => router.push(href), 600) }
          else if (evt.type === 'done') conversationId.current = evt.conversationId
          else if (evt.type === 'error') setError(evt.message)
        }
      }
    } catch (e: any) { setError(e?.message || 'No se pudo conectar con NORA.') }
    finally { setStreaming(false); setToolStatus(null); setMessages((arr) => { const c = [...arr]; const l = c[c.length - 1]; if (l?.role === 'assistant' && !l.content.trim()) c.pop(); return c }) }
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      {/* Historial */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-card/40 lg:flex">
        <div className="p-3"><Button size="sm" className="w-full" onClick={nueva}><Plus className="size-4" /> Nueva conversación</Button></div>
        <div className="flex-1 overflow-y-auto px-2 pb-3">
          <div className="px-2 py-1 text-[11px] font-medium uppercase text-muted-foreground">Historial</div>
          {historial.length === 0 ? <div className="px-2 py-2 text-xs text-muted-foreground">Todavía no hay conversaciones.</div> : historial.map((c) => (
            <button key={c.id} onClick={() => cargarConv(c)} className="block w-full truncate rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted/60">
              <MessageSquare className="mr-1.5 inline size-3.5 text-muted-foreground" />{c.titulo}
            </button>
          ))}
        </div>
      </aside>

      {/* Chat */}
      <div className="flex flex-1 flex-col">
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 md:px-8">
          {messages.length === 0 ? (
            <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 pt-10 text-center">
              <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Sparkles className="size-7" /></div>
              <div>
                <h1 className="text-2xl font-semibold">Hola{nombre ? `, ${nombre.split(' ')[0]}` : ''} 👋</h1>
                <p className="mt-1 text-sm text-muted-foreground">Soy NORA. Preguntame de todo el negocio: ventas, compras, caja, clientes, stock. Puedo explicarte, sugerirte y —con tu OK— hacer cosas.</p>
              </div>
              {!iaConfigurada && <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-700">Falta conectar la IA (ANTHROPIC_API_KEY). Mientras tanto, las NoraCards y sugerencias funcionan con datos reales.</div>}
              <div className="grid w-full gap-2 sm:grid-cols-2">
                {SUGERENCIAS.map((s) => { const I = s.icon; return (
                  <button key={s.txt} onClick={() => send(s.txt)} disabled={!iaConfigurada} className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 text-left text-sm hover:border-primary/40 disabled:opacity-50">
                    <I className="size-4 text-primary" /> {s.txt}
                  </button>
                )})}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-2xl space-y-4">
              {messages.map((m, i) => (
                <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                  <div className={cn('max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm', m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted')}>
                    {m.content || (streaming && i === messages.length - 1 ? <Loader2 className="size-4 animate-spin" /> : '')}
                  </div>
                </div>
              ))}
              {toolStatus && <div className="mx-auto flex max-w-2xl items-center gap-1.5 text-xs text-muted-foreground"><Wrench className="size-3.5 animate-pulse" /> {toolStatus}…</div>}
              {error && <div className="rounded-lg border border-rose-500/40 bg-rose-500/5 px-3 py-2 text-sm text-rose-700">{error}</div>}
            </div>
          )}
        </div>

        {/* Input */}
        <form onSubmit={(e) => { e.preventDefault(); send(input) }} className="border-t border-border p-3 md:px-8">
          <div className="mx-auto flex max-w-2xl items-end gap-2">
            <textarea ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) } }}
              rows={1} placeholder={iaConfigurada ? 'Preguntale a NORA…' : 'Conectá la IA para chatear'} disabled={!iaConfigurada || streaming}
              className="max-h-32 flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50" />
            <Button type="submit" size="icon" className="size-10 shrink-0 rounded-xl" disabled={!input.trim() || streaming || !iaConfigurada}>
              {streaming ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
