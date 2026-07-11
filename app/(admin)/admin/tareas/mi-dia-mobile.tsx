'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Camera, Check, Clock, Lock, Loader2, Mic, Send, Sparkles, Play,
  CornerUpRight, ChevronRight,
} from 'lucide-react'
import { toast } from 'sonner'

import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import type { TipoTarea } from '@/lib/types/tareas'
import type { AdminUserOption } from '@/lib/admin-hub/users'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

const BUCKET = 'tareas-evidencias'
const DOS_HORAS = 2 * 60 * 60 * 1000

type Row = any

type Grupo = 'ahora' | 'hoy' | 'semana'
const GRUPO_LABEL: Record<Grupo, string> = { ahora: 'Ahora', hoy: 'Hoy', semana: 'Esta semana' }

function arDate(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(ms))
}

/** Momento efectivo de la tarea: si está pospuesta, manda pospuesta_hasta. */
function tEfectivo(t: Row): number | null {
  const raw = t.pospuesta_hasta ?? t.fecha_vencimiento
  return raw ? new Date(raw).getTime() : null
}

function grupoDe(t: Row, now: number): Grupo {
  const te = tEfectivo(t)
  if (t.prioridad === 'critica') return 'ahora'
  if (te == null) return 'semana'
  if (te <= now + DOS_HORAS) return 'ahora' // vencidas + próximas 2hs
  if (arDate(te) === arDate(now)) return 'hoy'
  return 'semana'
}

function requeridasDe(t: Row): string[] {
  if (t.evidencia_opt_out) return []
  return (t.tipo?.evidencia_requerida ?? []) as string[]
}

function horaLabel(t: Row): string | null {
  const te = tEfectivo(t)
  if (te != null) {
    const ms = te - Date.now()
    if (ms < 0) {
      const h = Math.floor(-ms / 3_600_000)
      return h >= 1 ? `Vencida hace ${h}h` : 'Vencida'
    }
    const h = ms / 3_600_000
    if (h < 1) return `en ${Math.max(1, Math.floor(ms / 60_000))} min`
    if (h < 24) return new Date(te).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' })
    return `${Math.floor(h / 24)}d`
  }
  if (t.hora_limite) return String(t.hora_limite).slice(0, 5)
  if (t.tipo?.sla_horas) return `SLA ${t.tipo.sla_horas}h`
  return null
}

export function MiDiaMobile({
  tareas,
  tipos,
  users,
  sucursales,
  currentUserId,
  progresoDia,
}: {
  tareas: Row[]
  tipos: TipoTarea[]
  users: AdminUserOption[]
  sucursales: { id: string; nombre: string }[]
  currentUserId: string
  progresoDia: { total: number; completadas: number }
}) {
  const router = useRouter()
  const sb = createClient()
  const [items, setItems] = useState<Row[]>(tareas)
  const [busy, setBusy] = useState<string | null>(null)
  const [posponer, setPosponer] = useState<Row | null>(null)
  const [noraLinea, setNoraLinea] = useState<string | null>(null)

  const capRef = useRef<HTMLInputElement>(null)
  const capTarget = useRef<Row | null>(null)

  useEffect(() => { setItems(tareas) }, [tareas])

  // Franja NORA: la prioridad del día (reusa la agenda propuesta).
  useEffect(() => {
    let alive = true
    fetch('/api/tareas/agenda').then((r) => r.json()).then((j) => {
      if (!alive) return
      const p = (j?.propuestas ?? [])[0]
      if (p?.titulo) setNoraLinea(p.titulo)
    }).catch(() => {})
    return () => { alive = false }
  }, [])

  const now = Date.now()
  const grupos = useMemo(() => {
    const g: Record<Grupo, Row[]> = { ahora: [], hoy: [], semana: [] }
    for (const t of items) g[grupoDe(t, now)].push(t)
    const orden = (a: Row, b: Row) => (tEfectivo(a) ?? Infinity) - (tEfectivo(b) ?? Infinity)
    g.ahora.sort(orden); g.hoy.sort(orden); g.semana.sort(orden)
    return g
  }, [items, now])

  function quitar(id: string) {
    setItems((prev) => prev.filter((t) => t.id !== id))
  }

  async function completar(t: Row, evidencias?: any[]) {
    setBusy(t.id)
    try {
      const r = await fetch(`/api/tareas/${t.id}/accion`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accion: 'completar', ...(evidencias ? { evidencias } : {}) }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error || 'No se pudo completar.')
      toast.success('¡Hecha! Va a verificación.')
      quitar(t.id)
      router.refresh()
    } catch (e: any) {
      toast.error(e?.message ?? 'Error')
    } finally {
      setBusy(null)
    }
  }

  function pedirFoto(t: Row) {
    capTarget.current = t
    capRef.current?.click()
  }

  async function onFotoElegida(file: File) {
    const t = capTarget.current
    capTarget.current = null
    if (!t) return
    setBusy(t.id)
    try {
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `${t.id}/foto-${Date.now()}.${ext}`
      const { error } = await sb.storage.from(BUCKET).upload(path, file, { upsert: true })
      if (error) throw new Error(error.message)
      await completar(t, [{ tipo: 'foto', url: path, timestamp: new Date().toISOString(), user_id: '' }])
    } catch (e: any) {
      toast.error(e?.message ?? 'No se pudo subir la foto.')
      setBusy(null)
    }
  }

  async function confirmarPosponer(motivo: string) {
    const t = posponer
    if (!t) return
    setBusy(t.id)
    try {
      const r = await fetch(`/api/tareas/${t.id}/accion`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accion: 'posponer', motivo }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error || 'No se pudo posponer.')
      toast.success('Pospuesta.')
      setItems((prev) => prev.map((x) => x.id === t.id ? { ...x, pospuesta_motivo: motivo } : x))
      setPosponer(null)
      router.refresh()
    } catch (e: any) {
      toast.error(e?.message ?? 'Error')
    } finally {
      setBusy(null)
    }
  }

  const pct = progresoDia.total > 0 ? Math.round((progresoDia.completadas / progresoDia.total) * 100) : 0
  const vacio = items.length === 0

  return (
    <div className="pb-24">
      {/* Franja NORA */}
      {noraLinea && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-primary">
          <Sparkles className="mt-0.5 size-4 shrink-0" />
          <span><b>NORA:</b> arrancá por «{noraLinea}»</span>
        </div>
      )}

      {/* Progreso */}
      {progresoDia.total > 0 && (
        <div className="mb-3">
          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>Progreso de hoy</span>
            <span>{progresoDia.completadas}/{progresoDia.total}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {vacio ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-center">
          <Check className="size-8 text-emerald-500" />
          <div className="font-medium">Día limpio</div>
          <div className="text-sm text-muted-foreground">No te queda nada pendiente. Buen laburo.</div>
        </div>
      ) : (
        (['ahora', 'hoy', 'semana'] as Grupo[]).map((g) =>
          grupos[g].length === 0 ? null : (
            <section key={g} className="mb-4">
              <h2 className={cn('mb-1.5 px-0.5 text-[11px] font-bold uppercase tracking-wider',
                g === 'ahora' ? 'text-destructive' : 'text-muted-foreground')}>
                {GRUPO_LABEL[g]} · {grupos[g].length}
              </h2>
              <div className="space-y-2">
                {grupos[g].map((t) => (
                  <TareaCard
                    key={t.id}
                    t={t}
                    busy={busy === t.id}
                    onCompletar={() => completar(t)}
                    onFoto={() => pedirFoto(t)}
                    onEmpezar={() => router.push(`/admin/tareas/${t.id}`)}
                    onAbrir={() => router.push(`/admin/tareas/${t.id}`)}
                    onPosponer={() => setPosponer(t)}
                  />
                ))}
              </div>
            </section>
          ),
        )
      )}

      {/* input de cámara oculto, compartido */}
      <input
        ref={capRef}
        type="file"
        accept="image/*"
        capture={'environment' as any}
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFotoElegida(f); e.currentTarget.value = '' }}
      />

      <QuickCreateBar
        tipos={tipos}
        users={users}
        sucursales={sucursales}
        currentUserId={currentUserId}
      />

      {posponer && (
        <PosponerModal
          titulo={posponer.titulo}
          busy={busy === posponer.id}
          onCancel={() => setPosponer(null)}
          onConfirm={confirmarPosponer}
        />
      )}
    </div>
  )
}

function TareaCard({
  t, busy, onCompletar, onFoto, onEmpezar, onAbrir, onPosponer,
}: {
  t: Row
  busy: boolean
  onCompletar: () => void
  onFoto: () => void
  onEmpezar: () => void
  onAbrir: () => void
  onPosponer: () => void
}) {
  const esperando: string[] = t._esperando ?? []
  const bloqueada = esperando.length > 0
  const requeridas = requeridasDe(t)
  const pospuesta = Boolean(t.pospuesta_motivo)
  const soloFoto = requeridas.length === 1 && requeridas[0] === 'foto'
  const sinEvidencia = requeridas.length === 0
  const hora = horaLabel(t)
  const color = t.tipo?.color ?? '#94a3b8'

  // Gestos: swipe derecha = completar (solo sin evidencia); izquierda = posponer.
  const [dx, setDx] = useState(0)
  const startX = useRef<number | null>(null)
  const moved = useRef(false)

  function onDown(e: React.PointerEvent) {
    if (bloqueada) return
    startX.current = e.clientX
    moved.current = false
  }
  function onMove(e: React.PointerEvent) {
    if (startX.current == null) return
    const d = e.clientX - startX.current
    if (Math.abs(d) > 6) moved.current = true
    setDx(Math.max(-120, Math.min(120, d)))
  }
  function onUp() {
    const d = dx
    startX.current = null
    setDx(0)
    if (d > 80 && sinEvidencia && !bloqueada) { onCompletar(); return }
    if (d < -80 && !bloqueada) { onPosponer(); return }
  }
  function onClickCard() {
    if (moved.current) return
    onAbrir()
  }

  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* fondos de swipe */}
      <div className="absolute inset-0 flex items-center justify-between px-4 text-xs font-semibold">
        <span className={cn('flex items-center gap-1 text-emerald-600', dx > 20 ? 'opacity-100' : 'opacity-0')}>
          <Check className="size-4" /> Hecha
        </span>
        <span className={cn('flex items-center gap-1 text-amber-600', dx < -20 ? 'opacity-100' : 'opacity-0')}>
          Posponer <CornerUpRight className="size-4" />
        </span>
      </div>

      <div
        className={cn(
          'relative rounded-xl border bg-card p-3 transition-transform',
          bloqueada && 'opacity-60',
        )}
        style={{ transform: `translateX(${dx}px)`, transition: startX.current == null ? 'transform .18s' : 'none', borderLeft: `4px solid ${color}` }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => { startX.current = null; setDx(0) }}
        onClick={onClickCard}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              {t.tipo?.nombre && <span className="truncate">{t.tipo.nombre}</span>}
              {pospuesta && <span className="rounded-full bg-amber-500/15 px-1.5 py-px font-bold text-amber-600">pospuesta</span>}
            </div>
            <div className="mt-0.5 text-[15px] font-semibold leading-tight">{t.titulo}</div>
          </div>
          {hora && (
            <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-muted-foreground">
              <Clock className="size-3" /> {hora}
            </span>
          )}
        </div>

        <div className="mt-2.5" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
          {bloqueada ? (
            <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              <Lock className="size-3.5 shrink-0" /> Esperando: {esperando.join(' · ')}
            </div>
          ) : sinEvidencia ? (
            <Button size="lg" className="h-11 w-full" disabled={busy} onClick={onCompletar}>
              {busy ? <Loader2 className="size-5 animate-spin" /> : <Check className="size-5" />} Hecha
            </Button>
          ) : soloFoto ? (
            <Button size="lg" className="h-11 w-full" disabled={busy} onClick={onFoto}>
              {busy ? <Loader2 className="size-5 animate-spin" /> : <Camera className="size-5" />} Sacar foto
            </Button>
          ) : (
            <Button size="lg" variant="outline" className="h-11 w-full" onClick={onEmpezar}>
              <Play className="size-5" /> Empezar <ChevronRight className="ml-auto size-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function PosponerModal({
  titulo, busy, onCancel, onConfirm,
}: {
  titulo: string
  busy: boolean
  onCancel: () => void
  onConfirm: (motivo: string) => void
}) {
  const [motivo, setMotivo] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={onCancel}>
      <div className="w-full rounded-t-2xl border-t bg-background p-4 pb-6" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted" />
        <div className="mb-1 text-sm font-semibold">Posponer tarea</div>
        <div className="mb-3 truncate text-xs text-muted-foreground">{titulo}</div>
        <Textarea
          autoFocus
          rows={3}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="¿Por qué la posponés? (obligatorio)"
        />
        <div className="mt-3 flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={onCancel}>Cancelar</Button>
          <Button className="flex-1" disabled={busy || motivo.trim().length < 3} onClick={() => onConfirm(motivo.trim())}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : 'Posponer'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function QuickCreateBar({
  tipos, users, sucursales, currentUserId,
}: {
  tipos: TipoTarea[]
  users: AdminUserOption[]
  sucursales: { id: string; nombre: string }[]
  currentUserId: string
}) {
  const router = useRouter()
  const sb = createClient()
  const [texto, setTexto] = useState('')
  const [parsing, setParsing] = useState(false)
  const [creando, setCreando] = useState(false)
  const [draft, setDraft] = useState<any | null>(null)

  const tipoNombre = draft?.tipo_tarea_id ? tipos.find((t) => t.id === draft.tipo_tarea_id)?.nombre : null
  const sucNombre = draft?.sucursal_id ? sucursales.find((s) => s.id === draft.sucursal_id)?.nombre : null
  const respNombre = draft?.responsable_user_id ? (users.find((u) => u.id === draft.responsable_user_id)?.nombre ?? 'asignado') : null

  async function parsear() {
    const t = texto.trim()
    if (!t) return
    setParsing(true)
    try {
      const r = await fetch('/api/nora/parse-task', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ texto: t }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error || 'NORA no pudo interpretar.')
      setDraft(j.draft)
    } catch (e: any) {
      toast.error(e?.message ?? 'Error')
    } finally {
      setParsing(false)
    }
  }

  async function crear() {
    if (!draft) return
    setCreando(true)
    try {
      const tipo = draft.tipo_tarea_id ? tipos.find((t) => t.id === draft.tipo_tarea_id) : null
      const { data, error } = await sb.from('tareas').insert({
        tipo_tarea_id: draft.tipo_tarea_id || null,
        tipo_origen: 'nora',
        titulo: String(draft.titulo || texto).slice(0, 200),
        descripcion: draft.descripcion || null,
        prioridad: draft.prioridad || 'media',
        estado: draft.responsable_user_id ? 'asignada' : 'pendiente',
        responsable_id: draft.responsable_user_id || null,
        sucursal_id: draft.sucursal_id || null,
        fecha_asignacion: draft.responsable_user_id ? new Date().toISOString() : null,
        fecha_vencimiento: draft.fecha_vencimiento_iso || null,
        sla_horas: tipo?.sla_horas ?? null,
        creado_por: currentUserId,
      }).select('id').maybeSingle<{ id: string }>()
      if (error || !data) throw new Error(error?.message || 'No se pudo crear.')
      await sb.from('tareas_historial').insert({
        tarea_id: data.id, user_id: currentUserId, accion: 'creada',
        estado_nuevo: { estado: draft.responsable_user_id ? 'asignada' : 'pendiente' },
      })
      toast.success('Tarea creada.')
      setDraft(null); setTexto('')
      router.refresh()
    } catch (e: any) {
      toast.error(e?.message ?? 'Error')
    } finally {
      setCreando(false)
    }
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur">
      {draft && (
        <div className="border-b p-3">
          <div className="mb-1 text-xs font-semibold">NORA entendió:</div>
          <div className="text-sm font-medium">{draft.titulo}</div>
          <div className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
            {tipoNombre && <Chip>{tipoNombre}</Chip>}
            {respNombre && <Chip>{respNombre}</Chip>}
            {sucNombre && <Chip>{sucNombre}</Chip>}
            {draft.fecha_vencimiento_iso && <Chip>vence {new Date(draft.fecha_vencimiento_iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</Chip>}
            <Chip>{draft.prioridad}</Chip>
          </div>
          <div className="mt-2 flex gap-2">
            <Button variant="ghost" size="sm" className="flex-1" onClick={() => setDraft(null)}>Descartar</Button>
            <Button size="sm" className="flex-1" disabled={creando} onClick={crear}>
              {creando ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Crear
            </Button>
          </div>
        </div>
      )}
      <div className="flex items-center gap-2 p-2.5">
        <Input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') parsear() }}
          placeholder="Nueva tarea…"
          className="h-11 flex-1 rounded-full"
        />
        <button
          type="button"
          disabled
          title="Dictado por voz — próximamente"
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground opacity-50"
        >
          <Mic className="size-5" />
        </button>
        <Button
          size="icon"
          className="size-11 shrink-0 rounded-full"
          disabled={parsing || !texto.trim()}
          onClick={parsear}
        >
          {parsing ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-5" />}
        </Button>
      </div>
    </div>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{children}</span>
}
