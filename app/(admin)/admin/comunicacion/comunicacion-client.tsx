'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Send, Plus, Search, Hash, Building2, Truck, Pin, AlertTriangle, Sparkles, CheckCheck, ListChecks, Smile, MessageSquare, BarChart3, X } from 'lucide-react'
import { toast } from 'sonner'

import { createClient } from '@/lib/supabase/client'
import { pareceTarea } from '@/lib/comunicacion/deteccion'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

export type UserLite = { id: string; nombre: string | null; email: string; rol: string; sucursal_id: string | null }
export type CanalRow = { id: string; nombre: string; tipo: string; vinculo: string | null; esMiembro: boolean; unread: number; ultimo: string; ultimoAt: string | null }
type Msg = { id: string; canal_id: string; hilo_id: string | null; autor_user_id: string | null; tipo: string; contenido: string | null; adjuntos: any[]; acciones: any[] | null; es_urgente: boolean; fijado: boolean; entidad_relacionada: any; created_at: string }

const GRUPOS: [string, string][] = [['sucursal', 'Sucursales'], ['sector', 'Sectores'], ['operacion', 'Operación'], ['proveedor', 'Proveedores'], ['directo', 'Directos'], ['general', 'General']]
const EMOJIS = ['👍', '✅', '❤️', '😂', '🙏', '🚨']

async function api(body: any) {
  const r = await fetch('/api/comunicacion', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const j = await r.json(); if (!r.ok) throw new Error(j?.error || 'Error'); return j
}

export function ComunicacionClient({ canales, canalActivo, msgFocus, totalNoLeidos, yo, usuarios }: { canales: CanalRow[]; canalActivo: string | null; msgFocus?: string | null; totalNoLeidos: number; yo: UserLite; usuarios: UserLite[] }) {
  const router = useRouter()
  const [activo, setActivo] = useState<string | null>(canalActivo ?? canales[0]?.id ?? null)
  const [q, setQ] = useState('')
  const [crear, setCrear] = useState(false)
  const [buscarMsg, setBuscarMsg] = useState(false)
  const [focusMsg, setFocusMsg] = useState<string | null>(msgFocus ?? null)
  const esEncargado = ['super_admin', 'gerente', 'administrativo', 'sucursal'].includes(yo.rol)
  const userName = (id: string | null) => id == null ? 'NORA' : (usuarios.find((u) => u.id === id)?.nombre || usuarios.find((u) => u.id === id)?.email || 'Usuario')

  const grupos = useMemo(() => GRUPOS.map(([tipo, label]) => ({ label, canales: canales.filter((c) => c.tipo === tipo && (!q.trim() || c.nombre.toLowerCase().includes(q.toLowerCase()))) })).filter((g) => g.canales.length), [canales, q])
  const canalActual = canales.find((c) => c.id === activo)

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col md:flex-row">
      {/* Canales */}
      <aside className={cn('flex w-full shrink-0 flex-col border-r border-border md:w-72', activo && 'hidden md:flex')}>
        <div className="flex items-center gap-2 border-b border-border p-3">
          <div className="relative flex-1"><Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar canal…" className="h-8 pl-8 text-xs" /></div>
          {esEncargado && <Button size="icon" className="size-8" onClick={() => setCrear(true)}><Plus className="size-4" /></Button>}
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {grupos.length === 0 && <div className="p-4 text-center text-xs text-muted-foreground">Sin canales. {esEncargado ? 'Creá uno.' : ''}</div>}
          {grupos.map((g) => (
            <div key={g.label} className="mb-2">
              <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{g.label}</div>
              {g.canales.map((c) => (
                <button key={c.id} onClick={() => { setActivo(c.id); api({ accion: 'leer', canal_id: c.id }).catch(() => {}) }}
                  className={cn('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors', activo === c.id ? 'bg-nora-bg text-primary' : 'hover:bg-accent')}>
                  {c.vinculo === 'transferencias' ? <Truck className="size-3.5 shrink-0" /> : c.tipo === 'sucursal' ? <Building2 className="size-3.5 shrink-0" /> : <Hash className="size-3.5 shrink-0" />}
                  <span className="flex-1 truncate">{c.nombre}</span>
                  {c.unread > 0 && <Badge variant="info" className="h-5 px-1.5 text-[10px]">{c.unread}</Badge>}
                </button>
              ))}
            </div>
          ))}
        </div>
        <div className="border-t border-border p-2">
          <button onClick={() => setBuscarMsg(true)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"><Search className="size-4" /> Buscar en mensajes</button>
          <Link href="/admin/comunicacion/mi-bandeja" className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"><MessageSquare className="size-4" /> Mi bandeja</Link>
          <Link href="/admin/comunicacion/comunicados" className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"><CheckCheck className="size-4" /> Comunicados</Link>
        </div>
      </aside>

      {/* Conversación */}
      <main className={cn('flex flex-1 flex-col', !activo && 'hidden md:flex')}>
        {canalActual ? <Conversacion canal={canalActual} yo={yo} esEncargado={esEncargado} usuarios={usuarios} userName={userName} onBack={() => setActivo(null)} focusMsg={focusMsg} onFocused={() => setFocusMsg(null)} />
          : <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Elegí un canal</div>}
      </main>

      {crear && <CrearCanal usuarios={usuarios} yo={yo} onClose={() => setCrear(false)} onCreated={(id) => { setCrear(false); router.push(`/admin/comunicacion?canal=${id}`); router.refresh() }} />}
      {buscarMsg && <MsgSearch onClose={() => setBuscarMsg(false)} onPick={(canalId, msgId) => { setActivo(canalId); setFocusMsg(msgId); setBuscarMsg(false) }} />}
    </div>
  )
}

type MsgHit = { id: string; canal_id: string; canal: string; autor: string; fecha: string; fragmento: string }

function MsgSearch({ onClose, onPick }: { onClose: () => void; onPick: (canalId: string, msgId: string) => void }) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<MsgHit[]>([])
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) { setHits([]); return }
    let alive = true
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/comunicacion/search?q=${encodeURIComponent(term)}`, { cache: 'no-store' })
        const j = await r.json()
        if (alive) setHits((j?.hits ?? []) as MsgHit[])
      } catch { if (alive) setHits([]) } finally { if (alive) setLoading(false) }
    }, 220)
    return () => { alive = false; clearTimeout(t) }
  }, [q])
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader><SheetTitle>Buscar en mensajes</SheetTitle></SheetHeader>
        <div className="relative mt-3"><Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Palabra o frase…" className="pl-8" /></div>
        <div className="mt-3 flex-1 space-y-1.5 overflow-y-auto">
          {loading && <div className="p-3 text-center text-xs text-muted-foreground">Buscando…</div>}
          {!loading && q.trim().length >= 2 && hits.length === 0 && <div className="p-3 text-center text-xs text-muted-foreground">Sin resultados en tus canales.</div>}
          {hits.map((h) => (
            <button key={h.id} onClick={() => onPick(h.canal_id, h.id)} className="w-full rounded-md border border-border p-2.5 text-left hover:bg-accent">
              <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground"><span className="font-medium text-primary">{h.canal}</span><span>{String(h.fecha).slice(0, 16).replace('T', ' ')}</span></div>
              <div className="mt-0.5 text-sm">{h.fragmento}</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">— {h.autor}</div>
            </button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function Conversacion({ canal, yo, esEncargado, usuarios, userName, onBack, focusMsg, onFocused }: { canal: CanalRow; yo: UserLite; esEncargado: boolean; usuarios: UserLite[]; userName: (id: string | null) => string; onBack: () => void; focusMsg?: string | null; onFocused?: () => void }) {
  const sb = useMemo(() => createClient(), [])
  const router = useRouter()
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [reacciones, setReacciones] = useState<Record<string, { emoji: string; user: string }[]>>({})
  const [tareaEstados, setTareaEstados] = useState<Record<string, { estado: string; responsable_id: string | null }>>({})
  const [panico, setPanico] = useState<{ id: string; user_id: string | null } | null>(null)
  const [encuestas, setEncuestas] = useState<Record<string, { id: string; opciones: string[]; multi: boolean; votos: { user_id: string; opcion: string }[] }>>({})
  const [pollOpen, setPollOpen] = useState(false)
  const [texto, setTexto] = useState('')
  const [urgente, setUrgente] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  async function load() {
    const { data } = await sb.from('mensajes').select('*').eq('canal_id', canal.id).order('created_at', { ascending: true }).limit(500)
    setMsgs((data ?? []) as Msg[])
    const ids = ((data ?? []) as any[]).map((m) => m.id)
    if (ids.length) {
      const { data: rx } = await sb.from('mensaje_reacciones').select('mensaje_id, emoji, user_id').in('mensaje_id', ids)
      const map: Record<string, any[]> = {}
      for (const r of (rx ?? []) as any[]) (map[r.mensaje_id] ??= []).push({ emoji: r.emoji, user: r.user_id })
      setReacciones(map)
    }
    // Estado VIVO de las tareas referenciadas en mensajes (chat→tarea card viva).
    const tareaIds = [...new Set(((data ?? []) as any[])
      .map((m) => m.entidad_relacionada)
      .filter((e) => e?.tipo === 'tarea' && e.id)
      .map((e) => e.id as string))]
    if (tareaIds.length) {
      const { data: ts } = await sb.from('tareas').select('id, estado, responsable_id').in('id', tareaIds)
      const tmap: Record<string, { estado: string; responsable_id: string | null }> = {}
      for (const t of (ts ?? []) as any[]) tmap[t.id] = { estado: t.estado, responsable_id: t.responsable_id }
      setTareaEstados(tmap)
    }
    // Pánico activo en este canal (banner persistente).
    const { data: pe } = await sb.from('panico_eventos').select('id, user_id').eq('canal_id', canal.id).eq('estado', 'activo').order('creado_at', { ascending: false }).limit(1).maybeSingle()
    setPanico((pe as any) ?? null)
    // Encuestas + votos de los mensajes cargados.
    const encMsgIds = ((data ?? []) as any[]).filter((m) => m.tipo === 'encuesta').map((m) => m.id)
    if (encMsgIds.length) {
      const { data: encs } = await sb.from('encuestas').select('id, mensaje_id, opciones, multi').in('mensaje_id', encMsgIds)
      const byMsg: Record<string, any> = {}
      const encIds: string[] = []
      for (const e of (encs ?? []) as any[]) { byMsg[e.mensaje_id] = { id: e.id, opciones: e.opciones ?? [], multi: e.multi, votos: [] }; encIds.push(e.id) }
      if (encIds.length) {
        const { data: votos } = await sb.from('encuesta_votos').select('encuesta_id, user_id, opcion').in('encuesta_id', encIds)
        const byEnc: Record<string, any[]> = {}
        for (const v of (votos ?? []) as any[]) (byEnc[v.encuesta_id] ??= []).push({ user_id: v.user_id, opcion: v.opcion })
        for (const mid of Object.keys(byMsg)) byMsg[mid].votos = byEnc[byMsg[mid].id] ?? []
      }
      setEncuestas(byMsg)
    } else setEncuestas({})
  }

  async function votar(encuestaId: string, opcion: string) {
    try { await api({ accion: 'votar', encuesta_id: encuestaId, opcion }); load() } catch (e: any) { toast.error(e?.message ?? 'Error') }
  }

  async function resolverPanico(estado: 'falsa_alarma' | 'resuelto') {
    if (!panico) return
    try { await api({ accion: 'resolver_panico', evento_id: panico.id, estado }); setPanico(null); load() } catch (e: any) { toast.error(e?.message ?? 'Error') }
  }

  useEffect(() => {
    load()
    const ch = sb.channel(`canal:${canal.id}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensajes', filter: `canal_id=eq.${canal.id}` }, (payload) => {
      setMsgs((prev) => prev.some((m) => m.id === (payload.new as any).id) ? prev : [...prev, payload.new as Msg])
    }).subscribe()
    return () => { try { sb.removeChannel(ch) } catch { /* noop */ } }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canal.id])

  useEffect(() => { if (!focusMsg) endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, focusMsg])

  // Al llegar desde la búsqueda/⌘K, posicionar en el mensaje y resaltarlo.
  useEffect(() => {
    if (!focusMsg) return
    const el = document.getElementById(`msg-${focusMsg}`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const t = setTimeout(() => onFocused?.(), 2600)
    return () => clearTimeout(t)
  }, [focusMsg, msgs, onFocused])

  async function enviar() {
    const c = texto.trim(); if (!c) return
    setEnviando(true); setTexto(''); setUrgente(false)
    try {
      const menciones = usuarios.filter((u) => c.includes(`@${u.nombre}`)).map((u) => u.id)
      await api({ accion: 'enviar', canal_id: canal.id, contenido: c, es_urgente: urgente, menciones })
    } catch (e: any) { toast.error(e?.message ?? 'Error'); setTexto(c) } finally { setEnviando(false) }
  }
  async function reaccionar(id: string, emoji: string) { try { await api({ accion: 'reaccionar', mensaje_id: id, emoji }); load() } catch {} }
  async function fijar(m: Msg) { try { await api({ accion: 'fijar', mensaje_id: m.id, fijado: !m.fijado }); load() } catch {} }
  async function confirmar(id: string) { try { await api({ accion: 'confirmar_lectura', mensaje_id: id }); toast.success('Confirmado.') } catch {} }
  async function crearTarea(m: Msg) {
    const titulo = prompt('Título de la tarea:', (m.contenido ?? '').slice(0, 60)); if (!titulo) return
    try { const j = await api({ accion: 'crear_tarea', mensaje_id: m.id, titulo, sucursal_id: yo.sucursal_id }); toast.success(`Tarea ${j.codigo} creada.`) } catch (e: any) { toast.error(e?.message ?? 'Error') }
  }
  async function ejecutarAccion(m: Msg, a: any) {
    if (a.accion === 'crear_tarea') {
      try { const j = await api({ accion: 'crear_tarea', mensaje_id: m.id, titulo: a.payload?.titulo ?? 'Tarea', sucursal_id: a.payload?.sucursal_id ?? yo.sucursal_id }); toast.success(`Tarea ${j.codigo} creada.`) } catch (e: any) { toast.error(e?.message ?? 'Error') }
    } else toast.message('Acción no disponible en demo.')
  }

  const fijados = msgs.filter((m) => m.fijado)
  // Recurrencia barata (in-memory): mensajes "tipo problema" del canal en 30 días.
  const hace30 = Date.now() - 30 * 86_400_000
  const problemasMes = msgs.filter((m) => !m.hilo_id && !m.entidad_relacionada && pareceTarea(m.contenido) && new Date(m.created_at).getTime() >= hace30).length

  return (
    <>
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Button variant="ghost" size="sm" className="md:hidden" onClick={onBack}>←</Button>
        {canal.vinculo === 'transferencias' ? <Truck className="size-4 text-primary" /> : <Hash className="size-4 text-muted-foreground" />}
        <div className="flex-1"><div className="font-semibold">{canal.nombre}</div>{canal.vinculo && <div className="text-[11px] text-muted-foreground">vinculado a {canal.vinculo}</div>}</div>
      </header>

      {panico && (
        <div className="flex flex-wrap items-center gap-2 border-b-2 border-rose-600 bg-rose-600/15 px-4 py-2.5">
          <AlertTriangle className="size-5 shrink-0 animate-pulse text-rose-600" />
          <span className="flex-1 text-sm font-bold text-rose-700 dark:text-rose-400">
            🚨 PÁNICO ACTIVO{panico.user_id ? ` — ${userName(panico.user_id)} pidió ayuda` : ''}
          </span>
          {(esEncargado || panico.user_id === yo.id) && (
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => resolverPanico('falsa_alarma')}>Falsa alarma</Button>
              <Button size="sm" className="h-7 bg-rose-600 text-xs hover:bg-rose-700" onClick={() => resolverPanico('resuelto')}>Resuelto</Button>
            </div>
          )}
        </div>
      )}

      {fijados.length > 0 && (
        <div className="border-b border-border bg-muted/30 px-4 py-1.5">
          {fijados.map((m) => <div key={m.id} className="flex items-center gap-1.5 text-xs text-muted-foreground"><Pin className="size-3" /> {m.contenido}</div>)}
        </div>
      )}

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {msgs.filter((m) => !m.hilo_id).map((m) => (
          <div key={m.id} id={`msg-${m.id}`} className={cn('rounded-lg transition-all', focusMsg === m.id && 'bg-primary/5 ring-2 ring-primary/40')}>
            <Mensaje m={m} yo={yo} esEncargado={esEncargado} reacciones={reacciones[m.id] ?? []} userName={userName}
              hilo={msgs.filter((x) => x.hilo_id === m.id)} tareaEstados={tareaEstados} problemasMes={problemasMes} onConverted={load}
              encuesta={encuestas[m.id]} onVote={votar}
              onReaccion={(e) => reaccionar(m.id, e)} onFijar={() => fijar(m)} onConfirmar={() => confirmar(m.id)} onCrearTarea={() => crearTarea(m)} onAccion={(a) => ejecutarAccion(m, a)} />
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div className="border-t border-border p-3">
        <div className="flex items-end gap-2">
          <button type="button" onClick={() => setUrgente((u) => !u)} title="Urgente" className={cn('rounded-md border p-2', urgente ? 'border-rose-500 bg-rose-500/10 text-rose-600' : 'border-border text-muted-foreground')}><AlertTriangle className="size-4" /></button>
          {esEncargado && <button type="button" onClick={() => setPollOpen(true)} title="Crear encuesta" className="rounded-md border border-border p-2 text-muted-foreground hover:text-foreground"><BarChart3 className="size-4" /></button>}
          <Input value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }} placeholder="Escribí… (@NORA para preguntar, @nombre para mencionar)" className="flex-1" />
          <Button size="icon" disabled={enviando} onClick={enviar}><Send className="size-4" /></Button>
        </div>
        {urgente && <div className="mt-1 text-[11px] text-rose-600 dark:text-rose-400">🚨 Se enviará como URGENTE (notifica a todos).</div>}
      </div>

      {pollOpen && <PollComposer canalId={canal.id} onClose={() => setPollOpen(false)} onCreated={() => { setPollOpen(false); load() }} />}
    </>
  )
}

function PollComposer({ canalId, onClose, onCreated }: { canalId: string; onClose: () => void; onCreated: () => void }) {
  const [pregunta, setPregunta] = useState('')
  const [opciones, setOpciones] = useState<string[]>(['', ''])
  const [multi, setMulti] = useState(false)
  const [busy, setBusy] = useState(false)

  function setOpcion(i: number, v: string) { setOpciones((p) => p.map((x, j) => j === i ? v : x)) }
  const validas = opciones.map((o) => o.trim()).filter(Boolean)

  async function crear() {
    if (!pregunta.trim() || validas.length < 2) { toast.error('Pregunta y al menos 2 opciones.'); return }
    setBusy(true)
    try {
      await api({ accion: 'crear_encuesta', canal_id: canalId, pregunta: pregunta.trim(), opciones: validas, multi })
      toast.success('Encuesta publicada.'); onCreated()
    } catch (e: any) { toast.error(e?.message ?? 'Error') } finally { setBusy(false) }
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader><SheetTitle>Nueva encuesta</SheetTitle></SheetHeader>
        <div className="flex flex-1 flex-col gap-4 pt-4">
          <div className="space-y-1.5"><Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Pregunta</Label><Input value={pregunta} onChange={(e) => setPregunta(e.target.value)} placeholder="¿Qué turno preferís para el inventario?" /></div>
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Opciones (2 a 6)</Label>
            {opciones.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input value={o} onChange={(e) => setOpcion(i, e.target.value)} placeholder={`Opción ${i + 1}`} />
                {opciones.length > 2 && <button onClick={() => setOpciones((p) => p.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>}
              </div>
            ))}
            {opciones.length < 6 && <Button size="sm" variant="outline" onClick={() => setOpciones((p) => [...p, ''])}><Plus className="size-3.5" /> Agregar opción</Button>}
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} className="size-4 accent-[hsl(var(--primary))]" /> Permitir votar varias opciones</label>
          <Button size="lg" disabled={busy} onClick={crear}>{busy ? 'Publicando…' : 'Publicar encuesta'}</Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function Mensaje({ m, yo, esEncargado, reacciones, hilo, userName, tareaEstados, problemasMes, onConverted, encuesta, onVote, onReaccion, onFijar, onConfirmar, onCrearTarea, onAccion }: { m: Msg; yo: UserLite; esEncargado: boolean; reacciones: { emoji: string; user: string }[]; hilo: Msg[]; userName: (id: string | null) => string; tareaEstados: Record<string, { estado: string; responsable_id: string | null }>; problemasMes: number; onConverted: () => void; encuesta?: { id: string; opciones: string[]; multi: boolean; votos: { user_id: string; opcion: string }[] }; onVote: (encuestaId: string, opcion: string) => void; onReaccion: (e: string) => void; onFijar: () => void; onConfirmar: () => void; onCrearTarea: () => void; onAccion: (a: any) => void }) {
  const [showEmoji, setShowEmoji] = useState(false)
  const esSistema = m.tipo === 'sistema' || m.autor_user_id == null
  const mio = m.autor_user_id === yo.id
  const conteo = reacciones.reduce((acc: Record<string, number>, r) => { acc[r.emoji] = (acc[r.emoji] ?? 0) + 1; return acc }, {})

  if (esSistema) {
    return (
      <div className="flex flex-col items-center gap-1">
        <div className={cn('max-w-[85%] rounded-lg px-3 py-1.5 text-center text-xs', m.autor_user_id == null ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
          {m.autor_user_id == null && <Sparkles className="mr-1 inline size-3" />}{m.contenido}
        </div>
        {m.acciones?.length ? <div className="flex gap-1.5">{m.acciones.map((a, i) => esEncargado && <Button key={i} size="sm" variant="outline" className="h-6 text-[11px]" onClick={() => onAccion(a)}>{a.label}</Button>)}</div> : null}
      </div>
    )
  }

  return (
    <div className={cn('group flex gap-2', mio && 'flex-row-reverse')}>
      <div className={cn('max-w-[80%] space-y-1', mio && 'items-end')}>
        <div className={cn('rounded-2xl px-3 py-2 text-sm', mio ? 'bg-primary text-primary-foreground' : 'bg-card border border-border', m.es_urgente && 'ring-2 ring-rose-500')}>
          {!mio && <div className="mb-0.5 text-[11px] font-medium text-primary">{userName(m.autor_user_id)}</div>}
          {m.es_urgente && <div className="mb-1 flex items-center gap-1 text-[11px] font-bold text-rose-200"><AlertTriangle className="size-3" /> URGENTE</div>}
          <div className="whitespace-pre-wrap">{m.contenido}</div>
          {m.tipo === 'encuesta' && encuesta && <EncuestaCard enc={encuesta} yo={yo} userName={userName} onVote={onVote} />}
          {m.tipo === 'comunicado' && <Button size="sm" variant={mio ? 'secondary' : 'outline'} className="mt-2 h-7 text-xs" onClick={onConfirmar}><CheckCheck className="size-3.5" /> La vi</Button>}
          {m.entidad_relacionada?.tipo === 'tarea' && (
            <TareaCardViva ent={m.entidad_relacionada} estado={tareaEstados[m.entidad_relacionada.id]} userName={userName} />
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {Object.entries(conteo).map(([e, n]) => <button key={e} onClick={() => onReaccion(e)} className="rounded-full border border-border bg-card px-1.5 text-[11px]">{e} {n}</button>)}
          <div className="relative opacity-0 transition-opacity group-hover:opacity-100">
            <button onClick={() => setShowEmoji((s) => !s)} className="text-muted-foreground hover:text-foreground"><Smile className="size-3.5" /></button>
            {showEmoji && <div className="absolute z-10 mt-1 flex gap-1 rounded-md border border-border bg-popover p-1 shadow-md">{EMOJIS.map((e) => <button key={e} onClick={() => { onReaccion(e); setShowEmoji(false) }} className="hover:scale-125">{e}</button>)}</div>}
          </div>
          <button onClick={onFijar} className="text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100" title="Fijar"><Pin className="size-3.5" /></button>
          {esEncargado && <button onClick={onCrearTarea} className="text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100" title="Crear tarea"><ListChecks className="size-3.5" /></button>}
        </div>
        {esEncargado && !esSistema && !m.entidad_relacionada && pareceTarea(m.contenido) && (
          <NoraChip m={m} sucursalId={yo.sucursal_id} recurrencia={problemasMes} userName={userName} onConverted={onConverted} />
        )}
        {hilo.length > 0 && (
          <div className="ml-3 space-y-1 border-l-2 border-border pl-2">
            {hilo.map((h) => <div key={h.id} className="text-xs"><span className="font-medium text-primary">{userName(h.autor_user_id)}:</span> {h.contenido}</div>)}
          </div>
        )}
      </div>
    </div>
  )
}

/** Chip de NORA: sugiere convertir un mensaje en tarea (OS-2b · C). NORA nunca convierte sola. */
function NoraChip({ m, sucursalId, recurrencia, userName, onConverted }: { m: Msg; sucursalId: string | null; recurrencia: number; userName: (id: string | null) => string; onConverted: () => void }) {
  const [fase, setFase] = useState<'chip' | 'parsing' | 'confirm' | 'creando' | 'oculto'>('chip')
  const [draft, setDraft] = useState<any | null>(null)

  if (fase === 'oculto') return null

  async function abrir() {
    setFase('parsing')
    try {
      const r = await fetch('/api/nora/parse-task', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ texto: m.contenido }) })
      const j = await r.json()
      setDraft(r.ok ? j.draft : { titulo: (m.contenido ?? '').slice(0, 60), prioridad: 'media' })
    } catch {
      setDraft({ titulo: (m.contenido ?? '').slice(0, 60), prioridad: 'media' })
    }
    setFase('confirm')
  }

  async function crear() {
    if (!draft) return
    setFase('creando')
    try {
      const j = await api({
        accion: 'crear_tarea', mensaje_id: m.id,
        titulo: draft.titulo || (m.contenido ?? '').slice(0, 60),
        descripcion: m.contenido ?? null,
        prioridad: draft.prioridad || 'media',
        tipo_tarea_id: draft.tipo_tarea_id ?? null,
        responsable_id: draft.responsable_user_id ?? null,
        sucursal_id: draft.sucursal_id ?? sucursalId,
        fecha_vencimiento: draft.fecha_vencimiento_iso ?? null,
      })
      toast.success(`Tarea ${j.codigo} creada${(m.adjuntos?.length ?? 0) > 0 ? ' con la foto como evidencia' : ''}.`)
      setFase('oculto')
      onConverted()
    } catch (e: any) {
      toast.error(e?.message ?? 'Error'); setFase('confirm')
    }
  }

  if (fase === 'confirm' && draft) {
    return (
      <div className="mt-1.5 rounded-lg border border-primary/30 bg-nora-bg p-2 text-xs">
        <div className="flex items-center gap-1 font-medium text-primary"><Sparkles className="size-3.5" /> NORA arma esta tarea:</div>
        <div className="mt-1 font-medium">{draft.titulo}</div>
        <div className="mt-0.5 flex flex-wrap gap-1 text-[10px] text-muted-foreground">
          <span className="rounded-full bg-background px-1.5">{draft.prioridad ?? 'media'}</span>
          {draft.responsable_user_id && <span className="rounded-full bg-background px-1.5">{userName(draft.responsable_user_id)}</span>}
          {draft.fecha_vencimiento_iso && <span className="rounded-full bg-background px-1.5">vence {new Date(draft.fecha_vencimiento_iso).toLocaleDateString('es-AR')}</span>}
          {(m.adjuntos?.length ?? 0) > 0 && <span className="rounded-full bg-background px-1.5">📷 foto</span>}
        </div>
        <div className="mt-2 flex gap-1.5">
          <Button size="sm" className="h-7 flex-1 text-xs" onClick={crear}><ListChecks className="size-3.5" /> Crear tarea</Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setFase('oculto')}>No</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-1.5 flex items-center gap-1.5">
      <button onClick={abrir} disabled={fase === 'parsing' || fase === 'creando'} className="flex items-center gap-1 rounded-full border border-primary/30 bg-nora-bg px-2 py-0.5 text-[11px] text-primary transition-colors hover:bg-primary/10 disabled:opacity-60">
        <Sparkles className="size-3" /> {fase === 'parsing' ? 'NORA piensa…' : '¿Lo creo como tarea?'}
        {recurrencia >= 3 && <span className="ml-0.5 font-bold">· {recurrencia}ª similar este mes</span>}
      </button>
      <button onClick={() => setFase('oculto')} className="text-muted-foreground hover:text-foreground" title="Ignorar">×</button>
    </div>
  )
}

/** Card de encuesta con resultados en vivo (OS-2b · E). No anónima (operativo interno). */
function EncuestaCard({ enc, yo, userName, onVote }: { enc: { id: string; opciones: string[]; multi: boolean; votos: { user_id: string; opcion: string }[] }; yo: UserLite; userName: (id: string | null) => string; onVote: (encuestaId: string, opcion: string) => void }) {
  const opciones = Array.isArray(enc.opciones) ? enc.opciones : []
  const misVotos = new Set(enc.votos.filter((v) => v.user_id === yo.id).map((v) => v.opcion))
  const totalVotantes = new Set(enc.votos.map((v) => v.user_id)).size
  const conteo = (op: string) => enc.votos.filter((v) => v.opcion === op).length
  const votantes = (op: string) => enc.votos.filter((v) => v.opcion === op).map((v) => userName(v.user_id))
  const maxV = Math.max(1, ...opciones.map(conteo))

  return (
    <div className="mt-2 space-y-1.5">
      {opciones.map((op) => {
        const n = conteo(op)
        const votado = misVotos.has(op)
        const quienes = votantes(op)
        return (
          <button key={op} onClick={() => onVote(enc.id, op)}
            className={cn('relative w-full overflow-hidden rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors', votado ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent/40')}>
            <span className="absolute inset-y-0 left-0 bg-primary/10" style={{ width: `${(n / maxV) * 100}%` }} aria-hidden />
            <span className="relative flex items-center justify-between gap-2">
              <span className="font-medium">{votado ? '✓ ' : ''}{op}</span>
              <span className="text-muted-foreground">{n}</span>
            </span>
            {quienes.length > 0 && <span className="relative mt-0.5 block truncate text-[10px] text-muted-foreground">{quienes.join(', ')}</span>}
          </button>
        )
      })}
      <div className="text-[10px] text-muted-foreground">{totalVotantes} voto{totalVotantes === 1 ? '' : 's'}{enc.multi ? ' · elección múltiple' : ''}</div>
    </div>
  )
}

const TAREA_ESTADO_UI: Record<string, { label: string; cls: string }> = {
  pendiente: { label: 'Pendiente', cls: 'text-amber-600 dark:text-amber-400' },
  asignada: { label: 'Asignada', cls: 'text-amber-600 dark:text-amber-400' },
  reclamada: { label: 'Reclamada', cls: 'text-amber-600 dark:text-amber-400' },
  en_progreso: { label: 'En curso', cls: 'text-blue-600 dark:text-blue-400' },
  en_verificacion: { label: 'En verificación', cls: 'text-violet-600 dark:text-violet-400' },
  completada: { label: 'Completada', cls: 'text-emerald-600 dark:text-emerald-400' },
  rechazada: { label: 'Rechazada', cls: 'text-rose-600 dark:text-rose-400' },
  vencida: { label: 'Vencida', cls: 'text-rose-600 dark:text-rose-400' },
}

/** Card viva de una tarea originada/vinculada en el chat (OS-2b · B). */
function TareaCardViva({ ent, estado, userName }: { ent: any; estado?: { estado: string; responsable_id: string | null }; userName: (id: string | null) => string }) {
  const ui = estado ? (TAREA_ESTADO_UI[estado.estado] ?? { label: estado.estado, cls: 'text-muted-foreground' }) : null
  const completada = estado?.estado === 'completada'
  return (
    <div className={cn('mt-2 rounded-lg border-l-4 bg-card/60 p-2.5', completada ? 'border-emerald-500' : 'border-violet-500')}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] font-bold text-violet-600 dark:text-violet-400">
          <ListChecks className="size-3.5" /> Tarea {ent.codigo}
        </span>
        {ui && <span className={cn('text-[11px] font-medium', ui.cls)}>{ui.label}</span>}
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">
          {estado?.responsable_id ? userName(estado.responsable_id) : 'Sin asignar'}
        </span>
        <Link href={`/admin/tareas/${ent.id}`} className="text-[11px] font-medium text-primary hover:underline">Ver tarea →</Link>
      </div>
    </div>
  )
}

function CrearCanal({ usuarios, yo, onClose, onCreated }: { usuarios: UserLite[]; yo: UserLite; onClose: () => void; onCreated: (id: string) => void }) {
  const [f, setF] = useState({ nombre: '', tipo: 'sector', vinculo_modulo: '__none__', es_privado: false })
  const [miembros, setMiembros] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  // sugerencia de vínculo según el nombre (NORA)
  const sugerido = useMemo(() => {
    const n = f.nombre.toLowerCase()
    if (/env[ií]o|transfer/.test(n)) return 'transferencias'
    if (/correc|stock|ajuste/.test(n)) return 'stock'
    if (/compra|proveedor|drog/.test(n)) return 'compras'
    if (/caja/.test(n)) return 'caja'
    return null
  }, [f.nombre])
  async function submit() {
    if (!f.nombre.trim()) { toast.error('Nombre requerido.'); return }
    setBusy(true)
    try {
      const j = await api({ accion: 'crear_canal', nombre: f.nombre, tipo: f.tipo, vinculo_modulo: f.vinculo_modulo === '__none__' ? null : f.vinculo_modulo, es_privado: f.es_privado, miembros })
      toast.success('Canal creado.'); onCreated(j.id)
    } catch (e: any) { toast.error(e?.message ?? 'Error') } finally { setBusy(false) }
  }
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader><SheetTitle>Nuevo canal</SheetTitle></SheetHeader>
        <div className="flex flex-1 flex-col gap-4 pt-4">
          <div className="space-y-1.5"><Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Nombre</Label><Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} placeholder="#envios-SA01-SA02" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Tipo</Label>
              <Select value={f.tipo} onValueChange={(v) => setF({ ...f, tipo: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{[['sucursal', 'Sucursal'], ['sector', 'Sector'], ['operacion', 'Operación'], ['proveedor', 'Proveedor'], ['directo', 'Directo'], ['general', 'General']].map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Vincular a módulo</Label>
              <Select value={f.vinculo_modulo} onValueChange={(v) => setF({ ...f, vinculo_modulo: v })}><SelectTrigger><SelectValue placeholder="Ninguno" /></SelectTrigger><SelectContent><SelectItem value="__none__">Sin vínculo</SelectItem>{['transferencias', 'stock', 'proveedor', 'compras', 'caja'].map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select></div>
          </div>
          {sugerido && f.vinculo_modulo === '__none__' && <button type="button" onClick={() => setF({ ...f, vinculo_modulo: sugerido })} className="flex items-center gap-1.5 rounded-md bg-nora-bg px-2 py-1.5 text-xs text-primary"><Sparkles className="size-3.5" /> NORA sugiere vincular a "{sugerido}" — tocá para aplicar</button>}
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Miembros</Label>
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border p-2">
              {usuarios.filter((u) => u.id !== yo.id).map((u) => (
                <label key={u.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={miembros.includes(u.id)} onChange={() => setMiembros((p) => p.includes(u.id) ? p.filter((x) => x !== u.id) : [...p, u.id])} className="size-4 accent-[hsl(var(--primary))]" /> {u.nombre || u.email}</label>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.es_privado} onChange={(e) => setF({ ...f, es_privado: e.target.checked })} className="size-4 accent-[hsl(var(--primary))]" /> Privado (solo miembros)</label>
          <Button size="lg" disabled={busy} onClick={submit}>{busy ? 'Creando…' : 'Crear canal'}</Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
