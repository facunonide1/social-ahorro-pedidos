'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Loader2, X, Plus, Send, CheckCircle2, Clock } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

type Prop = {
  titulo: string
  descripcion: string
  prioridad: string
  sucursal_id: string | null
  origen: string
  responsable_id: string | null
  _incluir: boolean
}
const ORIGEN_CLS: Record<string, string> = { vencimiento: 'text-amber-600', irregularidad: 'text-rose-600', faltante: 'text-blue-600', agenda: 'text-primary', manual: 'text-emerald-600' }

export function AgendaClient({
  users,
  sucursales,
}: {
  users: { id: string; nombre: string }[]
  sucursales: { id: string; nombre: string }[]
}) {
  const router = useRouter()
  const [props, setProps] = useState<Prop[]>([])
  const [cargando, setCargando] = useState(true)
  const [busy, setBusy] = useState(false)
  const [estado, setEstado] = useState<'borrador' | 'publicada'>('borrador')
  const [sucursalId, setSucursalId] = useState<string | null>(null)
  const [esTodas, setEsTodas] = useState(true)
  const [autoHora, setAutoHora] = useState<string>('')
  const [nuevo, setNuevo] = useState('')

  const sucNombre = sucursalId ? sucursales.find((s) => s.id === sucursalId)?.nombre : null

  useEffect(() => {
    let alive = true
    fetch('/api/tareas/agenda').then((r) => r.json()).then((j) => {
      if (!alive) return
      setProps(((j.propuestas ?? []) as any[]).map((p) => ({ ...p, responsable_id: null, _incluir: true })))
      setEstado(j.estado ?? 'borrador')
      setSucursalId(j.sucursalId ?? null)
      setEsTodas(Boolean(j.esTodas))
      setAutoHora(j.autoHora ?? '')
    }).catch(() => {}).finally(() => alive && setCargando(false))
    return () => { alive = false }
  }, [])

  function upd(i: number, patch: Partial<Prop>) { setProps((p) => p.map((x, j) => j === i ? { ...x, ...patch } : x)) }

  function agregarRapida() {
    const t = nuevo.trim()
    if (!t) return
    setProps((p) => [{ titulo: t, descripcion: '', prioridad: 'media', sucursal_id: sucursalId, origen: 'manual', responsable_id: null, _incluir: true }, ...p])
    setNuevo('')
  }

  async function guardarAutoHora() {
    if (!sucursalId) { toast.error('Elegí una sucursal en el selector del header.'); return }
    setBusy(true)
    try {
      const r = await fetch('/api/tareas/agenda', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ modo: 'config', sucursal_id: sucursalId, auto_hora: autoHora || null }),
      })
      if (!r.ok) throw new Error((await r.json())?.error)
      toast.success(autoHora ? `Se auto-publicará a las ${autoHora}.` : 'Auto-publicación desactivada.')
    } catch (e: any) { toast.error(e?.message ?? 'Error') } finally { setBusy(false) }
  }

  async function publicar() {
    if (esTodas || !sucursalId) { toast.error('Elegí una sucursal en el header para publicar.'); return }
    const sel = props.filter((p) => p._incluir && p.titulo.trim())
    if (!sel.length) { toast.error('Elegí al menos una tarea.'); return }
    setBusy(true)
    try {
      const r = await fetch('/api/tareas/agenda', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ modo: 'publicar', sucursal_id: sucursalId, items: sel }),
      })
      const j = await r.json(); if (!r.ok) throw new Error(j?.error)
      if (j.already) { toast.info('La agenda ya estaba publicada.'); setEstado('publicada'); return }
      toast.success(`Agenda publicada · ${j.creadas} tarea(s) en las bandejas.`)
      setEstado('publicada')
      router.refresh()
    } catch (e: any) { toast.error(e?.message ?? 'Error') } finally { setBusy(false) }
  }

  if (cargando) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> NORA está armando la agenda…</div>

  if (estado === 'publicada') {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-emerald-500/40 bg-emerald-500/5 py-14 text-center">
        <CheckCircle2 className="size-9 text-emerald-500" />
        <div>
          <div className="font-medium">Agenda publicada{sucNombre ? ` · ${sucNombre}` : ''}</div>
          <div className="mt-0.5 text-sm text-muted-foreground">Las tareas ya están en las bandejas del equipo.</div>
        </div>
        <Button variant="outline" size="sm" onClick={() => router.push('/admin/tareas')}>Ir a las tareas</Button>
      </div>
    )
  }

  const seleccionadas = props.filter((p) => p._incluir).length

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-primary">
        <span className="flex items-center gap-2"><Sparkles className="size-4" /> Borrador de hoy{sucNombre ? ` · ${sucNombre}` : ' · todas las sucursales'}</span>
        {esTodas && <span className="text-xs text-muted-foreground">Elegí una sucursal en el header para publicar.</span>}
      </div>

      {/* Auto-publicación (Hobby: fallback lazy al primer acceso). */}
      {!esTodas && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm">
          <Clock className="size-4 text-muted-foreground" />
          <span className="text-muted-foreground">Auto-publicar a las</span>
          <Input type="time" value={autoHora} onChange={(e) => setAutoHora(e.target.value)} className="h-8 w-28" />
          <Button size="sm" variant="outline" disabled={busy} onClick={guardarAutoHora}>Guardar</Button>
          <span className="text-[11px] text-muted-foreground">Si a esa hora sigue en borrador, se publica sola.</span>
        </div>
      )}

      {/* Alta rápida */}
      <div className="flex items-center gap-2">
        <Input value={nuevo} onChange={(e) => setNuevo(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') agregarRapida() }} placeholder="Agregar tarea rápida…" className="h-9" />
        <Button size="sm" variant="outline" onClick={agregarRapida}><Plus className="size-4" /> Agregar</Button>
      </div>

      {props.length === 0 ? (
        <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">NORA no encontró nada urgente. Agregá tareas manualmente o publicá vacío.</div>
      ) : (
        <div className="space-y-2">
          {props.map((p, i) => (
            <div key={i} className={cn('flex items-start gap-2 rounded-lg border p-3', p._incluir ? 'border-border bg-card' : 'border-dashed opacity-50')}>
              <input type="checkbox" checked={p._incluir} onChange={(e) => upd(i, { _incluir: e.target.checked })} className="mt-2 size-4 accent-[hsl(var(--primary))]" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Input value={p.titulo} onChange={(e) => upd(i, { titulo: e.target.value })} className="h-8 font-medium" />
                {p.descripcion && <div className="text-xs text-muted-foreground">{p.descripcion}</div>}
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn('text-[10px] font-medium uppercase', ORIGEN_CLS[p.origen] ?? '')}>{p.origen}</span>
                  <Select value={p.prioridad} onValueChange={(v) => upd(i, { prioridad: v })}><SelectTrigger className="h-7 w-24 text-xs"><SelectValue /></SelectTrigger><SelectContent>{['baja', 'media', 'alta', 'critica'].map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select>
                  <select
                    value={p.responsable_id ?? ''}
                    onChange={(e) => upd(i, { responsable_id: e.target.value || null })}
                    className="h-7 rounded border bg-background px-1.5 text-xs text-muted-foreground"
                  >
                    <option value="">— Sin asignar —</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                  </select>
                </div>
              </div>
              <Button size="icon" variant="ghost" className="size-7 text-muted-foreground" onClick={() => setProps((prev) => prev.filter((_, j) => j !== i))}><X className="size-4" /></Button>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-end">
        <Button disabled={busy || !seleccionadas || esTodas} onClick={publicar}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Publicar agenda ({seleccionadas})
        </Button>
      </div>
    </div>
  )
}
