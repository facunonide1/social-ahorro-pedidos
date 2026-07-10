'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Trash2, Loader2, Save, Lock } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type Item = { id?: string; producto_id: string; sku: string | null; producto: string; sistema?: number; contado: number; diferencia?: number; valor?: number }

export function ConteoZonaClient({ controlId, estado, valor, nDif, items }: {
  controlId: string; estado: string; valor: number; nDif: number; items: Item[]
}) {
  const router = useRouter()
  const cerrado = estado === 'cerrado'
  const [lineas, setLineas] = useState<Item[]>(items.length ? items.map((i) => ({ ...i, contado: i.contado })) : [])
  const [q, setQ] = useState(''); const [matches, setMatches] = useState<any[]>([])
  const [busy, setBusy] = useState(false)
  const deb = useRef<any>(null)

  useEffect(() => {
    const t = q.trim()
    if (deb.current) clearTimeout(deb.current)
    if (t.length < 2) { setMatches([]); return }
    deb.current = setTimeout(async () => {
      try { const r = await fetch(`/api/ofertas/buscar-producto?q=${encodeURIComponent(t)}`); const j = await r.json(); setMatches(Array.isArray(j) ? j.filter((p: any) => !lineas.some((l) => l.producto_id === p.id)) : []) } catch { setMatches([]) }
    }, 250)
  }, [q, lineas])

  async function guardar(cerrar: boolean) {
    if (!lineas.length) { toast.error('Contá al menos un producto.'); return }
    setBusy(true)
    try {
      const r = await fetch('/api/operaciones/zonas', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accion: 'guardar_conteo', control_id: controlId, cerrar, items: lineas.map((l) => ({ producto_id: l.producto_id, sku: l.sku, contado: Number(l.contado) })) }),
      })
      const j = await r.json(); if (!r.ok) throw new Error(j?.error)
      toast.success(cerrar ? `Control cerrado: ${j.diferencias} diferencia(s), $${j.valor.toLocaleString('es-AR')}.` : 'Conteo guardado.')
      router.refresh()
    } catch (e: any) { toast.error(e?.message ?? 'Error') } finally { setBusy(false) }
  }

  if (cerrado) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-700"><Lock className="size-4" /> Control cerrado · {nDif} diferencia(s) · ${valor.toLocaleString('es-AR')} de descuadre</div>
        <ItemsTable lineas={items} readonly />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="relative"><Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto por SKU/nombre/EAN…" className="pl-8" /></div>
      {matches.length > 0 && <div className="rounded-md border border-border">{matches.map((m) => <button key={m.id} type="button" onClick={() => { setLineas((p) => [...p, { producto_id: m.id, sku: m.sku, producto: m.nombre, contado: 0 }]); setQ(''); setMatches([]) }} className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-accent"><span className="truncate">{m.nombre}</span><span className="font-mono text-[10px] text-muted-foreground">{m.sku}</span></button>)}</div>}

      {lineas.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2">Producto</th><th className="px-3 py-2 text-right">Sistema</th><th className="px-3 py-2 text-right">Contado</th><th className="px-3 py-2 text-right">Dif.</th><th className="px-2 py-2"></th></tr></thead>
            <tbody>
              {lineas.map((l, i) => (
                <tr key={l.producto_id} className="border-t border-border/60">
                  <td className="px-3 py-1.5">{l.producto} <span className="font-mono text-[10px] text-muted-foreground">{l.sku}</span></td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{l.sistema ?? '—'}</td>
                  <td className="px-3 py-1.5 text-right"><Input type="number" value={String(l.contado)} onChange={(e) => setLineas((p) => p.map((x, j) => j === i ? { ...x, contado: Number(e.target.value) } : x))} className="ml-auto h-7 w-20" /></td>
                  <td className={cn('px-3 py-1.5 text-right tabular-nums', l.sistema != null && l.contado - l.sistema !== 0 ? (l.contado - l.sistema < 0 ? 'text-rose-600' : 'text-blue-600') : '')}>{l.sistema != null ? (l.contado - l.sistema) : '—'}</td>
                  <td className="px-2 py-1.5"><Button size="icon" variant="ghost" className="size-6 text-rose-600" onClick={() => setLineas((p) => p.filter((_, j) => j !== i))}><Trash2 className="size-3.5" /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" disabled={busy} onClick={() => guardar(false)}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Guardar</Button>
        <Button disabled={busy} onClick={() => guardar(true)}><Lock className="size-4" /> Cerrar control</Button>
      </div>
    </div>
  )
}

function ItemsTable({ lineas, readonly }: { lineas: Item[]; readonly?: boolean }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2">Producto</th><th className="px-3 py-2 text-right">Sistema</th><th className="px-3 py-2 text-right">Contado</th><th className="px-3 py-2 text-right">Dif.</th><th className="px-3 py-2 text-right">$</th></tr></thead>
        <tbody>{lineas.map((l) => (
          <tr key={l.id ?? l.producto_id} className="border-t border-border/60">
            <td className="px-3 py-1.5">{l.producto} <span className="font-mono text-[10px] text-muted-foreground">{l.sku}</span></td>
            <td className="px-3 py-1.5 text-right tabular-nums">{l.sistema}</td><td className="px-3 py-1.5 text-right tabular-nums">{l.contado}</td>
            <td className={cn('px-3 py-1.5 text-right tabular-nums', (l.diferencia ?? 0) < 0 ? 'text-rose-600' : (l.diferencia ?? 0) > 0 ? 'text-blue-600' : '')}>{l.diferencia}</td>
            <td className="px-3 py-1.5 text-right tabular-nums">{l.valor ? `$${Math.abs(l.valor).toLocaleString('es-AR')}` : '—'}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  )
}
