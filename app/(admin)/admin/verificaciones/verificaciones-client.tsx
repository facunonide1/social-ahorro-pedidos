'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle2, ThumbsUp, ThumbsDown, Sparkles, Clock, MapPin, FileText } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { TaskPriorityBadge } from '@/components/tareas/task-badges'
import { EVIDENCIA_LABELS, type EvidenciaTipo } from '@/lib/types/tareas-enterprise'
import { cn } from '@/lib/utils'

export type VerifItem = {
  id: string
  codigo: string
  titulo: string
  sucursal: string
  responsable: string
  completadaHace: number | null
  tipoNombre: string | null
  categoria: string | null
  prioridad: 'baja' | 'media' | 'alta' | 'critica'
  preVerif: { resultado?: string; motivo?: string } | null
  evidencias: { tipo: string; valor: string | null; signedUrl: string | null }[]
}

export function VerificacionesClient({ items }: { items: VerifItem[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [sel, setSel] = useState<Set<string>>(new Set())

  const aprobables = useMemo(
    () => items.filter((i) => i.preVerif?.resultado === 'aprobada').map((i) => i.id),
    [items],
  )

  function toggle(id: string) {
    setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  async function accion(id: string, accion: 'aprobar' | 'rechazar', motivo?: string) {
    const r = await fetch(`/api/tareas/${id}/accion`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accion, motivo }),
    })
    return r.ok
  }

  async function aprobarLote() {
    const ids = [...sel].filter((id) => aprobables.includes(id))
    if (ids.length === 0) { toast.error('Seleccioná tareas que NORA haya pre-aprobado.'); return }
    setBusy(true)
    let ok = 0
    for (const id of ids) if (await accion(id, 'aprobar')) ok++
    setBusy(false)
    toast.success(`${ok} tarea${ok === 1 ? '' : 's'} aprobada${ok === 1 ? '' : 's'}.`)
    setSel(new Set())
    router.refresh()
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-20 text-center">
        <CheckCircle2 className="size-9 text-emerald-500" />
        <div>
          <div className="font-medium">Cola limpia</div>
          <div className="mt-0.5 text-sm text-muted-foreground">No hay tareas esperando verificación. Buen trabajo.</div>
        </div>
      </div>
    )
  }

  const masViejo = Math.max(...items.map((i) => i.completadaHace ?? 0))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">
          {items.length} pendiente{items.length === 1 ? '' : 's'} · espera más larga: {fmtMin(masViejo)}
        </div>
        <Button size="sm" disabled={busy || sel.size === 0} onClick={aprobarLote}>
          <ThumbsUp className="size-4" /> Aprobar seleccionadas ({[...sel].filter((id) => aprobables.includes(id)).length})
        </Button>
      </div>

      <div className="space-y-3">
        {items.map((it) => (
          <VerifCard key={it.id} it={it} busy={busy} setBusy={setBusy} selected={sel.has(it.id)}
            seleccionable={aprobables.includes(it.id)} onToggle={() => toggle(it.id)}
            onAprobar={async () => { setBusy(true); const ok = await accion(it.id, 'aprobar'); setBusy(false); ok ? (toast.success('Aprobada.'), router.refresh()) : toast.error('Error') }}
            onRechazar={async (m) => { setBusy(true); const ok = await accion(it.id, 'rechazar', m); setBusy(false); ok ? (toast.success('Rechazada.'), router.refresh()) : toast.error('Error') }} />
        ))}
      </div>
    </div>
  )
}

function VerifCard({ it, busy, selected, seleccionable, onToggle, onAprobar, onRechazar }: {
  it: VerifItem; busy: boolean; setBusy: (b: boolean) => void; selected: boolean; seleccionable: boolean
  onToggle: () => void; onAprobar: () => void; onRechazar: (m: string) => void
}) {
  const [rechazando, setRechazando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const sem = semaforo(it.preVerif?.resultado)

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <input type="checkbox" checked={selected} disabled={!seleccionable} onChange={onToggle}
            title={seleccionable ? 'Seleccionar' : 'NORA no la pre-aprobó: revisá individualmente'}
            className="mt-1 size-4 accent-[hsl(var(--primary))] disabled:opacity-40" />
          <div className="min-w-0">
            <Link href={`/admin/tareas/${it.id}`} className="font-medium hover:underline">{it.titulo}</Link>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span>{it.codigo}</span>
              {it.tipoNombre && <><span>·</span><span>{it.tipoNombre}</span></>}
              <span>·</span><span>{it.responsable}</span>
              <span>·</span><span>{it.sucursal}</span>
              {it.completadaHace != null && <><span>·</span><span className="flex items-center gap-0.5"><Clock className="size-3" />{fmtMin(it.completadaHace)}</span></>}
            </div>
          </div>
        </div>
        <TaskPriorityBadge prioridad={it.prioridad} />
      </div>

      {/* Evidencias */}
      {it.evidencias.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {it.evidencias.map((e, i) => <EvidenceThumb key={i} e={e} />)}
        </div>
      )}

      {/* Semáforo NORA */}
      <div className={cn('mt-3 flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs', sem.cls)}>
        <Sparkles className="size-3.5" />
        <span className="font-medium">NORA: {sem.label}</span>
        {it.preVerif?.motivo && <span className="opacity-80">· {it.preVerif.motivo}</span>}
      </div>

      {/* Acciones */}
      <div className="mt-3">
        {!rechazando ? (
          <div className="flex gap-2">
            <Button size="sm" disabled={busy} onClick={onAprobar}><ThumbsUp className="size-4" /> Aprobar</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setRechazando(true)}><ThumbsDown className="size-4" /> Rechazar</Button>
          </div>
        ) : (
          <div className="space-y-2">
            <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} placeholder="Motivo (mín. 10)…" />
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" disabled={busy || motivo.trim().length < 10} onClick={() => onRechazar(motivo.trim())}>Confirmar</Button>
              <Button size="sm" variant="ghost" onClick={() => setRechazando(false)}>Cancelar</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function EvidenceThumb({ e }: { e: { tipo: string; valor: string | null; signedUrl: string | null } }) {
  const esFoto = ['foto', 'foto_termometro', 'firma', 'archivo'].includes(e.tipo)
  if (esFoto && e.signedUrl) {
    return (
      <a href={e.signedUrl} target="_blank" rel="noopener noreferrer" className="group relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={e.signedUrl} alt={e.tipo} className="size-16 rounded-md border object-cover" />
        {e.valor && <span className="absolute bottom-0 left-0 right-0 rounded-b-md bg-black/60 text-center text-[10px] text-white">{e.valor}°</span>}
      </a>
    )
  }
  if (e.tipo === 'gps' && e.valor) {
    return <a href={`https://maps.google.com/?q=${e.valor}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs"><MapPin className="size-3" /> Ubicación</a>
  }
  return (
    <div className="flex max-w-[200px] items-center gap-1 rounded-md border px-2 py-1 text-xs">
      <FileText className="size-3 shrink-0" />
      <span className="truncate">{EVIDENCIA_LABELS[e.tipo as EvidenciaTipo] ?? e.tipo}{e.valor ? `: ${e.valor}` : ''}</span>
    </div>
  )
}

function semaforo(r?: string) {
  if (r === 'aprobada') return { label: 'aprobó', cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' }
  if (r === 'rechazada') return { label: 'rechazó', cls: 'bg-rose-500/10 text-rose-600 dark:text-rose-400' }
  if (r === 'dudosa') return { label: 'tiene dudas', cls: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' }
  return { label: 'sin analizar', cls: 'bg-muted text-muted-foreground' }
}

function fmtMin(m: number): string {
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`
}
