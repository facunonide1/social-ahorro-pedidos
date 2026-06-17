'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Search, Users, Clock, CheckCircle2, ListChecks, Hand } from 'lucide-react'
import { toast } from 'sonner'

import { cn } from '@/lib/utils'
import { TaskPriorityBadge, TaskStatusBadge } from '@/components/tareas/task-badges'
import { NuevaTareaSheet } from './nueva-tarea-sheet'
import { RegenerarAgendaButton } from '@/components/tareas/regenerar-agenda-button'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { TipoTarea } from '@/lib/types/tareas'
import type { AdminUserOption } from '@/lib/admin-hub/users'

type Row = {
  id: string
  codigo: string
  titulo: string
  prioridad: 'baja' | 'media' | 'alta' | 'critica'
  estado: string
  asignacion_tipo: string
  responsable_id: string | null
  fecha_vencimiento: string | null
  hora_limite: string | null
  creado_por_nombre: string | null
  tipo?: { nombre?: string; color?: string; categoria?: string; evidencia_requerida?: string[] } | null
}

export function BandejaV2Client({
  tab,
  tareas,
  usersMap,
  tipos,
  users,
  sucursales,
  currentUserId,
  currentUserRol,
  esSuper,
  progresoDia,
}: {
  tab: string
  tareas: Row[]
  usersMap: Record<string, string>
  tipos: TipoTarea[]
  users: AdminUserOption[]
  sucursales: { id: string; nombre: string }[]
  currentUserId: string
  currentUserRol: string
  esSuper: boolean
  progresoDia: { total: number; completadas: number }
}) {
  const [q, setQ] = useState('')
  const router = useRouter()
  const [claiming, setClaiming] = useState<string | null>(null)

  const filtradas = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return tareas
    return tareas.filter((t) => `${t.titulo} ${t.codigo} ${t.tipo?.nombre ?? ''}`.toLowerCase().includes(term))
  }, [tareas, q])

  async function reclamar(id: string) {
    setClaiming(id)
    try {
      const r = await fetch(`/api/tareas/${id}/reclamar`, { method: 'POST' })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error || 'No se pudo reclamar.')
      toast.success('¡La hacés vos! Pasó a "Mi día".')
      router.refresh()
    } catch (e: any) {
      toast.error(e?.message ?? 'Error al reclamar.')
      router.refresh()
    } finally {
      setClaiming(null)
    }
  }

  const pct = progresoDia.total > 0 ? Math.round((progresoDia.completadas / progresoDia.total) * 100) : 0

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar tarea…" className="h-9 pl-8" />
        </div>
        {esSuper && <RegenerarAgendaButton />}
        <NuevaTareaSheet tipos={tipos} users={users} sucursales={sucursales} currentUserId={currentUserId} />
      </div>

      {/* Progreso del día */}
      {tab === 'mi_dia' && progresoDia.total > 0 && (
        <div className="rounded-lg border bg-card p-3">
          <div className="mb-1.5 flex items-center justify-between text-sm">
            <span className="font-medium">Progreso de hoy</span>
            <span className="text-muted-foreground">
              {progresoDia.completadas} de {progresoDia.total} completadas
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {filtradas.length === 0 ? (
        <EmptyTab tab={tab} />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtradas.map((t) => (
            <TaskCardV2
              key={t.id}
              t={t}
              usersMap={usersMap}
              claimable={tab === 'pool'}
              claiming={claiming === t.id}
              onClaim={() => reclamar(t.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function TaskCardV2({
  t, usersMap, claimable, claiming, onClaim,
}: {
  t: Row
  usersMap: Record<string, string>
  claimable: boolean
  claiming: boolean
  onClaim: () => void
}) {
  const colorBar = t.tipo?.color ?? '#94a3b8'
  const esPool = t.asignacion_tipo === 'pool_turno' || t.asignacion_tipo === 'pool_sucursal'
  const responsable = t.responsable_id ? usersMap[t.responsable_id] : null
  const cd = countdown(t.fecha_vencimiento)

  const inner = (
    <div className="relative overflow-hidden rounded-lg border bg-card transition-colors hover:border-primary/40">
      <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ background: colorBar }} />
      <div className="space-y-2 p-3 pl-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              <ListChecks className="size-3" />
              <span>{t.codigo}</span>
              {t.tipo?.nombre && <><span>·</span><span className="truncate">{t.tipo.nombre}</span></>}
            </div>
            <div className="mt-0.5 truncate text-sm font-semibold">{t.titulo}</div>
          </div>
          <TaskPriorityBadge prioridad={t.prioridad} />
        </div>

        {t.creado_por_nombre && (
          <div className="text-[11px] text-nora">Asignada por {t.creado_por_nombre}</div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <TaskStatusBadge estado={t.estado as any} />
          {esPool && !t.responsable_id ? (
            <span className="rounded-full bg-nora-bg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
              Pool
            </span>
          ) : null}
          {cd && (
            <span className={cn('flex items-center gap-1 text-[11px] font-medium', cd.color)}>
              <Clock className="size-3" /> {cd.label}
            </span>
          )}
        </div>

        {(t.tipo?.evidencia_requerida?.length ?? 0) > 0 && (
          <div className="text-[10px] text-muted-foreground">
            Evidencia: {t.tipo!.evidencia_requerida!.join(', ')}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-0.5 text-xs text-muted-foreground">
          <span className="flex items-center gap-1 truncate">
            <Users className="size-3" />
            {responsable || (esPool ? 'Sin reclamar' : 'Sin responsable')}
          </span>
        </div>

        {claimable && (
          <Button size="sm" className="w-full" disabled={claiming} onClick={(e) => { e.preventDefault(); onClaim() }}>
            <Hand className="size-4" /> {claiming ? 'Tomando…' : 'La hago yo'}
          </Button>
        )}
      </div>
    </div>
  )

  // En pool el card no navega (el botón reclama); en el resto, link al detalle.
  if (claimable) return inner
  return (
    <Link href={`/admin/tareas/${t.id}`} className="block">
      {inner}
    </Link>
  )
}

function countdown(fv: string | null): { label: string; color: string } | null {
  if (!fv) return null
  const ms = new Date(fv).getTime() - Date.now()
  if (ms < 0) {
    const h = Math.floor(-ms / 3_600_000)
    return { label: h >= 1 ? `Vencida hace ${h}h` : 'Vencida', color: 'text-destructive' }
  }
  const h = ms / 3_600_000
  const label = h >= 24 ? `${Math.floor(h / 24)}d` : h >= 1 ? `${Math.floor(h)}h` : `${Math.floor(ms / 60_000)}min`
  const color = h > 2 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
  return { label: `Vence en ${label}`, color }
}

function EmptyTab({ tab }: { tab: string }) {
  const msg: Record<string, { icon: React.ReactNode; title: string; sub: string }> = {
    mi_dia: { icon: <CheckCircle2 className="size-7 text-emerald-500" />, title: 'Día limpio', sub: 'No tenés tareas pendientes hoy. Buen trabajo.' },
    pool: { icon: <Hand className="size-7 text-muted-foreground" />, title: 'Pool vacío', sub: 'No hay tareas sin reclamar en tu turno.' },
    mi_sucursal: { icon: <ListChecks className="size-7 text-muted-foreground" />, title: 'Sin tareas', sub: 'No hay tareas activas en tu sucursal.' },
    todas: { icon: <ListChecks className="size-7 text-muted-foreground" />, title: 'Sin tareas', sub: 'No hay tareas activas.' },
  }
  const m = msg[tab] ?? msg.todas
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center">
      {m.icon}
      <div>
        <div className="font-medium">{m.title}</div>
        <div className="mt-0.5 text-sm text-muted-foreground">{m.sub}</div>
      </div>
    </div>
  )
}
