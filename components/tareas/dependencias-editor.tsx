'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Lock, Check, X, Plus, Loader2, Search } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export type DepItem = { id: string; codigo: string; titulo: string; estado: string }
export type DepCandidate = { id: string; codigo: string; titulo: string }

const RESUELTA = new Set(['completada', 'descartada'])

/**
 * Editor de dependencias entre tareas (OS-2a · D).
 * Muestra las dependencias con su estado (resuelta ✓ / pendiente 🔒) y permite
 * agregar/quitar. La regla de bloqueo vive en el endpoint de acción.
 */
export function DependenciasEditor({
  tareaId,
  deps,
  candidates,
  canEdit,
}: {
  tareaId: string
  deps: DepItem[]
  candidates: DepCandidate[]
  canEdit: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [q, setQ] = useState('')

  const disponibles = useMemo(() => {
    const yaSon = new Set(deps.map((d) => d.id))
    const term = q.trim().toLowerCase()
    return candidates
      .filter((c) => c.id !== tareaId && !yaSon.has(c.id))
      .filter((c) => !term || `${c.titulo} ${c.codigo}`.toLowerCase().includes(term))
      .slice(0, 8)
  }, [candidates, deps, q, tareaId])

  async function mutar(payload: { add?: string; remove?: string }) {
    const key = payload.add ?? payload.remove ?? ''
    setBusy(key)
    try {
      const r = await fetch(`/api/tareas/${tareaId}/dependencias`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error || 'No se pudo actualizar.')
      toast.success(payload.add ? 'Dependencia agregada.' : 'Dependencia quitada.')
      setQ('')
      setAdding(false)
      router.refresh()
    } catch (e: any) {
      toast.error(e?.message ?? 'Error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-2">
      {deps.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sin dependencias. Esta tarea no espera a ninguna otra.</p>
      ) : (
        <ul className="space-y-1.5">
          {deps.map((d) => {
            const resuelta = RESUELTA.has(d.estado)
            return (
              <li
                key={d.id}
                className={cn(
                  'flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm',
                  resuelta ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-amber-500/40 bg-amber-500/5',
                )}
              >
                {resuelta ? (
                  <Check className="size-3.5 shrink-0 text-emerald-500" />
                ) : (
                  <Lock className="size-3.5 shrink-0 text-amber-500" />
                )}
                <Link href={`/admin/tareas/${d.id}`} className="min-w-0 flex-1 truncate hover:underline">
                  <span className="text-[10px] text-muted-foreground">{d.codigo}</span> {d.titulo}
                </Link>
                {canEdit && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-6 text-muted-foreground"
                    disabled={busy === d.id}
                    onClick={() => mutar({ remove: d.id })}
                  >
                    {busy === d.id ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" />}
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {canEdit && !adding && (
        <Button size="sm" variant="outline" className="w-full" onClick={() => setAdding(true)}>
          <Plus className="size-4" /> Agregar dependencia
        </Button>
      )}

      {canEdit && adding && (
        <div className="space-y-1.5 rounded-md border p-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar tarea de la sucursal…"
              className="h-8 pl-8"
            />
          </div>
          {disponibles.length === 0 ? (
            <p className="px-1 py-2 text-xs text-muted-foreground">Sin coincidencias.</p>
          ) : (
            <ul className="max-h-56 space-y-0.5 overflow-y-auto">
              {disponibles.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    disabled={busy === c.id}
                    onClick={() => mutar({ add: c.id })}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent/50 disabled:opacity-50"
                  >
                    {busy === c.id ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5 text-muted-foreground" />}
                    <span className="min-w-0 flex-1 truncate">
                      <span className="text-[10px] text-muted-foreground">{c.codigo}</span> {c.titulo}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Button size="sm" variant="ghost" className="w-full" onClick={() => { setAdding(false); setQ('') }}>
            Cancelar
          </Button>
        </div>
      )}
    </div>
  )
}
