'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Loader2, X, Check, ListPlus } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

type Prop = { titulo: string; descripcion: string; prioridad: string; sucursal_id: string | null; origen: string; _incluir: boolean }
const ORIGEN_CLS: Record<string, string> = { vencimiento: 'text-amber-600', irregularidad: 'text-rose-600', faltante: 'text-blue-600', agenda: 'text-primary' }

export function AgendaClient() {
  const router = useRouter()
  const [props, setProps] = useState<Prop[]>([])
  const [cargando, setCargando] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    fetch('/api/tareas/agenda').then((r) => r.json()).then((j) => {
      if (!alive) return
      setProps(((j.propuestas ?? []) as any[]).map((p) => ({ ...p, _incluir: true })))
    }).catch(() => {}).finally(() => alive && setCargando(false))
    return () => { alive = false }
  }, [])

  function upd(i: number, patch: Partial<Prop>) { setProps((p) => p.map((x, j) => j === i ? { ...x, ...patch } : x)) }

  async function crear() {
    const sel = props.filter((p) => p._incluir && p.titulo.trim())
    if (!sel.length) { toast.error('Elegí al menos una tarea.'); return }
    setBusy(true)
    try {
      const r = await fetch('/api/tareas/agenda', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items: sel }) })
      const j = await r.json(); if (!r.ok) throw new Error(j?.error)
      toast.success(`${j.creadas} tarea(s) creada(s).`); router.push('/admin/tareas')
    } catch (e: any) { toast.error(e?.message ?? 'Error') } finally { setBusy(false) }
  }

  if (cargando) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> NORA está armando la agenda…</div>
  if (!props.length) return <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">NORA no encontró nada urgente para la agenda de hoy. Todo bajo control 👌</div>

  const seleccionadas = props.filter((p) => p._incluir).length

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-primary">
        <Sparkles className="size-4" /> NORA propone <b>{props.length}</b> tarea(s) según lo que está pasando. Editá lo que quieras y descartá lo que no.
      </div>
      <div className="space-y-2">
        {props.map((p, i) => (
          <div key={i} className={cn('flex items-start gap-2 rounded-lg border p-3', p._incluir ? 'border-border bg-card' : 'border-dashed opacity-50')}>
            <input type="checkbox" checked={p._incluir} onChange={(e) => upd(i, { _incluir: e.target.checked })} className="mt-2 size-4 accent-[hsl(var(--primary))]" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Input value={p.titulo} onChange={(e) => upd(i, { titulo: e.target.value })} className="h-8 font-medium" />
              <div className="text-xs text-muted-foreground">{p.descripcion}</div>
              <div className="flex items-center gap-2">
                <span className={cn('text-[10px] font-medium uppercase', ORIGEN_CLS[p.origen] ?? '')}>{p.origen}</span>
                <Select value={p.prioridad} onValueChange={(v) => upd(i, { prioridad: v })}><SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger><SelectContent>{['baja', 'media', 'alta', 'critica'].map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select>
              </div>
            </div>
            <Button size="icon" variant="ghost" className="size-7 text-muted-foreground" onClick={() => upd(i, { _incluir: false })}><X className="size-4" /></Button>
          </div>
        ))}
      </div>
      <div className="flex justify-end">
        <Button disabled={busy || !seleccionadas} onClick={crear}>{busy ? <Loader2 className="size-4 animate-spin" /> : <ListPlus className="size-4" />} Crear {seleccionadas} tarea(s)</Button>
      </div>
    </div>
  )
}
