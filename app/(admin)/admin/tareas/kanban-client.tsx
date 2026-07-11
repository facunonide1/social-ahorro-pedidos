'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2, User, Clock } from 'lucide-react'
import { toast } from 'sonner'

import { cn } from '@/lib/utils'
import { TaskPriorityBadge } from '@/components/tareas/task-badges'
import type { AdminUserOption } from '@/lib/admin-hub/users'

type Row = any

const COLUMNAS: { key: string; label: string; estados: string[] }[] = [
  { key: 'pendiente', label: 'Pendiente', estados: ['pendiente', 'reclamada', 'asignada'] },
  { key: 'curso', label: 'En curso', estados: ['en_progreso'] },
  { key: 'hecho', label: 'Hecho', estados: ['en_verificacion'] },
  { key: 'verificado', label: 'Verificado', estados: ['completada'] },
]
const ACTIVOS = new Set(['pendiente', 'reclamada', 'asignada', 'en_progreso', 'en_verificacion'])

export function KanbanClient({
  tareas,
  usersMap,
  users,
  puedeReasignar,
}: {
  tareas: Row[]
  usersMap: Record<string, string>
  users: AdminUserOption[]
  puedeReasignar: boolean
}) {
  const router = useRouter()
  const [items, setItems] = useState<Row[]>(tareas)
  const [filtro, setFiltro] = useState<string>('')
  const [busy, setBusy] = useState<string | null>(null)

  // Carga por empleado: tareas activas hoy por responsable.
  const carga = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of items) {
      if (t.responsable_id && ACTIVOS.has(t.estado)) m.set(t.responsable_id, (m.get(t.responsable_id) ?? 0) + 1)
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [items])
  const maxCarga = carga[0]?.[1] ?? 0

  const visibles = useMemo(
    () => (filtro ? items.filter((t) => t.responsable_id === filtro) : items),
    [items, filtro],
  )

  async function reasignar(t: Row, responsableId: string) {
    setBusy(t.id)
    try {
      const r = await fetch(`/api/tareas/${t.id}/reasignar`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ responsable_id: responsableId || null }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error || 'No se pudo reasignar.')
      setItems((prev) => prev.map((x) => x.id === t.id
        ? { ...x, responsable_id: responsableId || null, estado: ['pendiente', 'reclamada'].includes(x.estado) && responsableId ? 'asignada' : x.estado }
        : x))
      toast.success('Reasignada.')
      router.refresh()
    } catch (e: any) {
      toast.error(e?.message ?? 'Error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* Carga por empleado */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setFiltro('')}
          className={cn('rounded-full border px-3 py-1 text-xs', !filtro ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground')}
        >
          Todos ({items.filter((t) => ACTIVOS.has(t.estado)).length})
        </button>
        {carga.map(([uid, n]) => (
          <button
            key={uid}
            onClick={() => setFiltro(filtro === uid ? '' : uid)}
            className={cn(
              'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs',
              filtro === uid ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground',
              n === maxCarga && maxCarga > 0 && 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400',
            )}
          >
            <User className="size-3" /> {usersMap[uid] ?? uid.slice(0, 6)}
            <span className="font-bold">{n}</span>
          </button>
        ))}
      </div>

      {/* Tablero */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNAS.map((col) => {
          const cards = visibles.filter((t) => col.estados.includes(t.estado))
          return (
            <div key={col.key} className="rounded-lg border bg-muted/30">
              <div className="flex items-center justify-between border-b px-3 py-2">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{col.label}</span>
                <span className="rounded-full bg-background px-1.5 text-xs text-muted-foreground">{cards.length}</span>
              </div>
              <div className="space-y-2 p-2">
                {cards.length === 0 ? (
                  <p className="px-1 py-4 text-center text-xs text-muted-foreground">—</p>
                ) : (
                  cards.map((t) => (
                    <KanbanCard
                      key={t.id}
                      t={t}
                      usersMap={usersMap}
                      users={users}
                      puedeReasignar={puedeReasignar && col.key !== 'verificado'}
                      busy={busy === t.id}
                      onReasignar={(uid) => reasignar(t, uid)}
                    />
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function KanbanCard({
  t, usersMap, users, puedeReasignar, busy, onReasignar,
}: {
  t: Row
  usersMap: Record<string, string>
  users: AdminUserOption[]
  puedeReasignar: boolean
  busy: boolean
  onReasignar: (uid: string) => void
}) {
  const color = t.tipo?.color ?? '#94a3b8'
  const cd = countdown(t.fecha_vencimiento)
  return (
    <div className="rounded-lg border bg-card p-2.5" style={{ borderLeft: `3px solid ${color}` }}>
      <Link href={`/admin/tareas/${t.id}`} className="block">
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm font-medium leading-tight">{t.titulo}</span>
          <TaskPriorityBadge prioridad={t.prioridad} />
        </div>
        {cd && (
          <div className={cn('mt-1 flex items-center gap-1 text-[10px]', cd.color)}>
            <Clock className="size-2.5" /> {cd.label}
          </div>
        )}
      </Link>
      <div className="mt-2 flex items-center gap-1.5">
        {busy ? (
          <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
        ) : puedeReasignar ? (
          <select
            value={t.responsable_id ?? ''}
            onChange={(e) => onReasignar(e.target.value)}
            className="w-full rounded border bg-background px-1.5 py-1 text-[11px] text-muted-foreground"
          >
            <option value="">— Sin responsable —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.nombre || u.email}</option>
            ))}
          </select>
        ) : (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <User className="size-3" /> {t.responsable_id ? (usersMap[t.responsable_id] ?? '—') : 'Sin responsable'}
          </span>
        )}
      </div>
    </div>
  )
}

function countdown(fv: string | null): { label: string; color: string } | null {
  if (!fv) return null
  const ms = new Date(fv).getTime() - Date.now()
  if (ms < 0) return { label: 'Vencida', color: 'text-destructive' }
  const h = ms / 3_600_000
  const label = h >= 24 ? `${Math.floor(h / 24)}d` : h >= 1 ? `${Math.floor(h)}h` : `${Math.floor(ms / 60_000)}min`
  return { label: `Vence en ${label}`, color: h > 2 ? 'text-muted-foreground' : 'text-amber-600 dark:text-amber-400' }
}
