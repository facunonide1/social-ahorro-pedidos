'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Send, Sparkles, Paperclip, Check, Pencil, Loader2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'

import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type Opcion = { valor: string; label: string; sub?: string }
type Confirmacion = { titulo: string; campos: { label: string; valor: string }[]; advertencias: string[] }
type Msg = {
  de: 'user' | 'nora'
  texto?: string
  degradado?: boolean
  opciones?: Opcion[]
  slot?: string
  slot_tipo?: string
  descripcion?: string
  nota?: string
  confirmacion?: Confirmacion
  herramienta_id?: string
  valores?: any
  resultado?: { entidad_id?: string | null }
}

/**
 * Chat de NORA Acciones (N-01..N-06). Slot-filling con chips reales, adjuntar
 * comprobante, card de confirmación antes de ejecutar. Mobile-first. Si falla la
 * IA, degrada con mensaje claro (nunca crashea).
 */
export function NoraAcciones({ subapp = 'finanzas' }: { subapp?: string }) {
  const sb = createClient()
  const [msgs, setMsgs] = useState<Msg[]>([{ de: 'nora', texto: '¡Hola! Soy NORA. Decime qué necesitás — por ejemplo *"quiero hacer pago Denver"* o *"¿cuánto le debemos a Denver?"*.' }])
  const [texto, setTexto] = useState('')
  const [busy, setBusy] = useState(false)
  const [conversacionId, setConversacionId] = useState<string | null>(null)
  // estado del flujo activo
  const flujo = useRef<{ herramienta_id?: string; valores?: any; slot?: string; slot_tipo?: string }>({})
  const endRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, busy])

  function historialParaApi(): { role: 'user' | 'assistant'; content: string }[] {
    return msgs.filter((m) => m.texto).map((m) => ({ role: m.de === 'user' ? 'user' : 'assistant', content: m.texto as string }))
  }

  async function llamar(payload: any) {
    setBusy(true)
    try {
      const r = await fetch('/api/nora/acciones', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ subapp, conversacion_id: conversacionId, historial: historialParaApi(), ...payload }) })
      const j = await r.json()
      if (j.conversacion_id) setConversacionId(j.conversacion_id)
      recibir(j)
    } catch {
      setMsgs((m) => [...m, { de: 'nora', texto: 'No pude conectar. Probá de nuevo en un momento.', degradado: true }])
    } finally { setBusy(false) }
  }

  function recibir(j: any) {
    flujo.current = { herramienta_id: j.herramienta_id, valores: j.valores, slot: j.slot, slot_tipo: j.slot_tipo }
    if (j.tipo === 'opciones') setMsgs((m) => [...m, { de: 'nora', descripcion: j.descripcion, nota: j.nota, opciones: j.opciones, slot: j.slot, slot_tipo: j.slot_tipo, herramienta_id: j.herramienta_id, valores: j.valores }])
    else if (j.tipo === 'confirmacion') setMsgs((m) => [...m, { de: 'nora', confirmacion: j.confirmacion, herramienta_id: j.herramienta_id, valores: j.valores }])
    else if (j.tipo === 'resultado') { setMsgs((m) => [...m, { de: 'nora', texto: j.texto, resultado: { entidad_id: j.entidad_id } }]); flujo.current = {} }
    else if (j.tipo === 'error') setMsgs((m) => [...m, { de: 'nora', texto: j.texto, degradado: true }])
    else setMsgs((m) => [...m, { de: 'nora', texto: j.texto, degradado: j.degradado }])
  }

  function enviarTexto() {
    const t = texto.trim(); if (!t || busy) return
    setTexto('')
    setMsgs((m) => [...m, { de: 'user', texto: t }])
    // Si hay un slot de número/texto esperando, va directo (sin modelo).
    const f = flujo.current
    if (f.herramienta_id && (f.slot_tipo === 'numero' || f.slot_tipo === 'texto') && f.slot) {
      llamar({ accion: 'slot', herramienta_id: f.herramienta_id, slot: f.slot, valor: t, valores: f.valores })
    } else {
      llamar({ mensaje: t, herramienta_id: f.herramienta_id, valores: f.valores })
    }
  }

  function elegir(op: Opcion) {
    if (busy) return
    const f = flujo.current
    setMsgs((m) => [...m, { de: 'user', texto: op.label }])
    llamar({ accion: 'slot', herramienta_id: f.herramienta_id, slot: f.slot, valor: op.valor, valores: f.valores })
  }

  async function subirFoto(file: File) {
    const f = flujo.current
    if (!f.herramienta_id || !f.slot) return
    setBusy(true)
    try {
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `nora/${Date.now()}.${ext}`
      const { error } = await sb.storage.from('comprobantes').upload(path, file, { upsert: true })
      if (error) throw new Error(error.message)
      setMsgs((m) => [...m, { de: 'user', texto: '📎 Comprobante adjunto' }])
      await llamar({ accion: 'slot', herramienta_id: f.herramienta_id, slot: f.slot, valor: path, valores: f.valores })
    } catch (e: any) { toast.error(e?.message ?? 'No se pudo subir la foto.'); setBusy(false) }
  }

  function confirmar(m: Msg) { if (busy) return; setMsgs((x) => [...x, { de: 'user', texto: 'Confirmar ✓' }]); llamar({ accion: 'confirmar', herramienta_id: m.herramienta_id, valores: m.valores }) }
  function corregir(m: Msg) { if (busy) return; setMsgs((x) => [...x, { de: 'user', texto: 'Corregir' }]); llamar({ accion: 'corregir', herramienta_id: m.herramienta_id, valores: m.valores }) }

  const esperaFoto = flujo.current.slot_tipo === 'evidencia'

  return (
    <div className="flex h-[calc(100vh-11rem)] flex-col rounded-lg border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <Sparkles className="size-4 text-primary" />
        <span className="text-sm font-semibold">NORA · acciones</span>
        <span className="ml-auto text-[10px] text-muted-foreground">confirmás vos antes de ejecutar</span>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {msgs.map((m, i) => (
          <div key={i} className={cn('flex', m.de === 'user' ? 'justify-end' : 'justify-start')}>
            <div className={cn('max-w-[85%] space-y-2', m.de === 'user' ? '' : 'w-full')}>
              {(m.texto || m.descripcion) && (
                <div className={cn('rounded-2xl px-3 py-2 text-sm', m.de === 'user' ? 'bg-primary text-primary-foreground' : m.degradado ? 'border border-amber-500/40 bg-amber-500/5' : 'bg-muted')}>
                  <div className="whitespace-pre-wrap">{renderMd(m.texto ?? m.descripcion ?? '')}</div>
                  {m.nota && <div className="mt-1 text-[11px] text-muted-foreground">{m.nota}</div>}
                  {m.resultado?.entidad_id && <Link href="/admin/finanzas/pagos" className="mt-1 block text-[11px] underline">Ver en Pagos →</Link>}
                </div>
              )}

              {m.opciones && m.slot_tipo !== 'evidencia' && (
                <div className="flex flex-wrap gap-1.5">
                  {m.opciones.map((o) => (
                    <button key={o.valor} onClick={() => elegir(o)} disabled={busy} className="rounded-full border border-border bg-background px-3 py-1.5 text-left text-xs transition-colors hover:border-primary/50 hover:bg-accent/40 disabled:opacity-50">
                      <span className="font-medium">{o.label}</span>{o.sub && <span className="ml-1 text-[10px] text-muted-foreground">{o.sub}</span>}
                    </button>
                  ))}
                </div>
              )}
              {m.slot_tipo === 'evidencia' && (
                <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={busy}><Paperclip className="size-4" /> Adjuntar foto</Button>
              )}

              {m.confirmacion && (
                <div className="rounded-xl border border-primary/30 bg-nora-bg p-3">
                  <div className="mb-2 text-sm font-semibold">{m.confirmacion.titulo}</div>
                  <div className="space-y-1">
                    {m.confirmacion.campos.map((c, j) => (
                      <div key={j} className="flex items-baseline justify-between gap-3 text-sm"><span className="text-muted-foreground">{c.label}</span><span className="text-right font-medium">{c.valor}</span></div>
                    ))}
                  </div>
                  {m.confirmacion.advertencias.map((a, j) => (
                    <div key={j} className="mt-2 flex items-start gap-1.5 rounded-md bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-700 dark:text-amber-400"><AlertTriangle className="mt-0.5 size-3 shrink-0" /> {a}</div>
                  ))}
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" className="flex-1" disabled={busy} onClick={() => confirmar(m)}><Check className="size-4" /> Confirmar</Button>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => corregir(m)}><Pencil className="size-4" /> Corregir</Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> NORA está pensando…</div>}
        <div ref={endRef} />
      </div>

      <div className="border-t border-border p-2.5">
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) subirFoto(f); e.currentTarget.value = '' }} />
          <Button size="icon" variant="ghost" className="size-9 shrink-0" disabled={busy || !esperaFoto} onClick={() => fileRef.current?.click()} title={esperaFoto ? 'Adjuntar comprobante' : 'Adjuntá cuando NORA lo pida'}><Paperclip className="size-4" /></Button>
          <Input value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') enviarTexto() }} placeholder="Escribí a NORA…" className="h-10 flex-1 rounded-full" disabled={busy} />
          <Button size="icon" className="size-10 shrink-0 rounded-full" disabled={busy || !texto.trim()} onClick={enviarTexto}><Send className="size-4" /></Button>
        </div>
      </div>
    </div>
  )
}

/** Markdown mínimo: **negrita** → <b>. */
function renderMd(s: string): React.ReactNode {
  const parts = s.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((p, i) => (p.startsWith('**') && p.endsWith('**') ? <b key={i}>{p.slice(2, -2)}</b> : <span key={i}>{p}</span>))
}
