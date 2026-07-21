'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, ShieldAlert, Check } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'

export type RecallRow = { id: string; producto: string; sku: string | null; motivo: string | null; referencia: string | null; estado: string; creado: string; cerrado: string | null; horas: number | null; pendientes: number }

export function RecallsClient({ rows, puedeGestionar }: { rows: RecallRow[]; puedeGestionar: boolean }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [matches, setMatches] = useState<any[]>([])
  const [sel, setSel] = useState<{ id: string; nombre: string } | null>(null)
  const [motivo, setMotivo] = useState('')
  const [ref, setRef] = useState('')
  const [busy, setBusy] = useState(false)
  const debRef = useRef<any>(null)

  useEffect(() => {
    const t = q.trim()
    if (debRef.current) clearTimeout(debRef.current)
    if (t.length < 2 || sel) { setMatches([]); return }
    debRef.current = setTimeout(async () => {
      try { const r = await fetch(`/api/ofertas/buscar-producto?q=${encodeURIComponent(t)}`); const j = await r.json(); setMatches((Array.isArray(j) ? j : []).slice(0, 6)) } catch { setMatches([]) }
    }, 200)
    return () => { if (debRef.current) clearTimeout(debRef.current) }
  }, [q, sel])

  async function iniciar() {
    if (!sel) return
    if (!confirm(`¿INICIAR RECALL de "${sel.nombre}"? Bloquea el SKU, crea tareas de retiro con foto en todas las sucursales y anuncia. Es una acción fuerte.`)) return
    setBusy(true)
    try {
      const r = await fetch('/api/compliance', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accion: 'iniciar_recall', producto_id: sel.id, motivo, referencia_anmat: ref }) })
      const j = await r.json(); if (!r.ok) throw new Error(j?.error)
      toast.success(`Recall iniciado — ${j.tareas} tarea(s) de retiro.`); setSel(null); setQ(''); setMotivo(''); setRef(''); router.refresh()
    } catch (e: any) { toast.error(e?.message ?? 'Error') } finally { setBusy(false) }
  }
  async function cerrar(id: string) {
    setBusy(true)
    try {
      const r = await fetch('/api/compliance', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accion: 'cerrar_recall', id }) })
      const j = await r.json(); if (!r.ok) throw new Error(j?.error)
      toast.success('Recall cerrado — SKU desbloqueado.'); router.refresh()
    } catch (e: any) { toast.error(e?.message ?? 'Error') } finally { setBusy(false) }
  }

  return (
    <div className="space-y-5">
      {puedeGestionar && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-rose-600 dark:text-rose-400"><ShieldAlert className="size-4" /> Iniciar recall</div>
          {!sel ? (
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar el producto a retirar…" className="pl-9" />
              {matches.length > 0 && (
                <div className="mt-1 overflow-hidden rounded-md border border-border bg-background">
                  {matches.map((m) => <button key={m.id} className="block w-full px-3 py-1.5 text-left text-sm hover:bg-accent" onClick={() => { setSel({ id: m.id, nombre: m.nombre }); setMatches([]) }}>{m.nombre} <span className="font-mono text-[10px] text-muted-foreground">{m.sku}</span></button>)}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-sm font-medium">⚠️ {sel.nombre}</div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Referencia ANMAT" />
                <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo" />
              </div>
              <div className="flex gap-2">
                <Button variant="destructive" disabled={busy} onClick={iniciar}><ShieldAlert className="size-4" /> Iniciar recall</Button>
                <Button variant="ghost" disabled={busy} onClick={() => { setSel(null); setQ('') }}>Cancelar</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed py-14 text-center text-sm text-muted-foreground">Sin recalls registrados. 👌</div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2"><span className="font-medium">{r.producto}</span><Badge variant={r.estado === 'activo' ? 'destructive' : 'outline'} className="font-normal">{r.estado}</Badge></div>
                <div className="text-xs text-muted-foreground">{r.referencia ? `ANMAT ${r.referencia} · ` : ''}{r.motivo ?? 'sin motivo'} · iniciado {r.creado}{r.cerrado ? ` · cerrado ${r.cerrado} (${r.horas}h)` : ''}</div>
              </div>
              {r.estado === 'activo' && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{r.pendientes} tarea(s) sin resolver</span>
                  {puedeGestionar && <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy || r.pendientes > 0} onClick={() => cerrar(r.id)}><Check className="size-3.5" /> Cerrar</Button>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
