'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export type ControladoRow = { id: string; nombre: string; sku: string | null; lista: string | null; recall: boolean }

export function ControladosClient({ rows, puedeEditar }: { rows: ControladoRow[]; puedeEditar: boolean }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [matches, setMatches] = useState<any[]>([])
  const [lista, setLista] = useState('IV')
  const [busy, setBusy] = useState(false)
  const debRef = useRef<any>(null)

  useEffect(() => {
    const t = q.trim()
    if (debRef.current) clearTimeout(debRef.current)
    if (t.length < 2) { setMatches([]); return }
    debRef.current = setTimeout(async () => {
      try { const r = await fetch(`/api/ofertas/buscar-producto?q=${encodeURIComponent(t)}`); const j = await r.json(); setMatches((Array.isArray(j) ? j : []).slice(0, 6)) } catch { setMatches([]) }
    }, 200)
    return () => { if (debRef.current) clearTimeout(debRef.current) }
  }, [q])

  async function marcar(producto_id: string, es_controlado: boolean) {
    setBusy(true)
    try {
      const r = await fetch('/api/compliance', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accion: 'marcar_controlado', producto_id, es_controlado, lista: es_controlado ? lista : null }) })
      const j = await r.json(); if (!r.ok) throw new Error(j?.error)
      toast.success(es_controlado ? 'Marcado como controlado.' : 'Desmarcado.'); setQ(''); router.refresh()
    } catch (e: any) { toast.error(e?.message ?? 'Error') } finally { setBusy(false) }
  }

  return (
    <div className="space-y-5">
      {puedeEditar && (
        <div className="rounded-lg border border-border p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Marcar un producto</div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[240px] flex-1">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o SKU…" className="pl-9" />
            </div>
            <Select value={lista} onValueChange={setLista}><SelectTrigger className="w-28"><SelectValue /></SelectTrigger><SelectContent>{['II', 'III', 'IV'].map((l) => <SelectItem key={l} value={l}>Lista {l}</SelectItem>)}</SelectContent></Select>
          </div>
          {matches.length > 0 && (
            <div className="mt-2 overflow-hidden rounded-md border border-border">
              {matches.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
                  <span className="min-w-0 truncate">{m.nombre} <span className="font-mono text-[10px] text-muted-foreground">{m.sku}</span></span>
                  <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={() => marcar(m.id, true)}><Plus className="size-3.5" /> Lista {lista}</Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div>
        <div className="mb-2 text-sm font-semibold">Controlados ({rows.length})</div>
        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">Ningún producto marcado como controlado todavía.</div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2">Producto</th><th className="px-3 py-2">Lista</th><th className="px-3 py-2">Estado</th><th className="px-3 py-2"></th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-3 py-1.5 font-medium">⚕ {r.nombre} <span className="font-mono text-[10px] text-muted-foreground">{r.sku}</span></td>
                    <td className="px-3 py-1.5"><Badge variant="secondary" className="font-normal">Lista {r.lista ?? '—'}</Badge></td>
                    <td className="px-3 py-1.5">{r.recall && <Badge variant="destructive" className="font-normal">RECALL</Badge>}</td>
                    <td className="px-3 py-1.5 text-right">{puedeEditar && <Button size="sm" variant="ghost" className="h-7 text-xs text-rose-600" disabled={busy} onClick={() => marcar(r.id, false)}><Trash2 className="size-3.5" /></Button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
