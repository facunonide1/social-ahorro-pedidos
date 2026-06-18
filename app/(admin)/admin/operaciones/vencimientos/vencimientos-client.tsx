'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Download, ArrowRightLeft, Undo2, Tag, Trash2, ClipboardList, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'

import { exportExcel } from '@/lib/utils/export-excel'
import { formatARS } from '@/lib/utils/format'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type LoteRow = {
  id: string; producto_id: string; sku: string | null; nombre: string
  sucursal_id: string; sucursal: string; lote: string | null; fecha: string
  dias: number; cantidad: number; costo: number; riesgo: number
  accion: 'baja' | 'ok' | 'transferir' | 'devolver' | 'ofertar'
  targetSucNombre: string | null; descuento: number | null
}

const TABS = [
  { k: 'vencidos', label: 'Vencidos', test: (d: number) => d < 0 },
  { k: '15', label: '≤15 días', test: (d: number) => d >= 0 && d <= 15 },
  { k: '30', label: '≤30 días', test: (d: number) => d > 15 && d <= 30 },
  { k: '60', label: '≤60 días', test: (d: number) => d > 30 && d <= 60 },
  { k: '90', label: '≤90 días', test: (d: number) => d > 60 && d <= 90 },
] as const

export function VencimientosClient({ rows, riesgoTotal }: { rows: LoteRow[]; riesgoTotal: number }) {
  const router = useRouter()
  const [tab, setTab] = useState<(typeof TABS)[number]['k']>('15')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  const counts = useMemo(() => Object.fromEntries(TABS.map((t) => [t.k, rows.filter((r) => t.test(r.dias)).length])), [rows])
  const visibles = useMemo(() => rows.filter((r) => TABS.find((t) => t.k === tab)!.test(r.dias)), [rows, tab])
  const vencidos = rows.filter((r) => r.dias < 0)

  async function darDeBaja(ids: string[]) {
    if (ids.length === 0) { toast.error('No hay lotes vencidos seleccionados.'); return }
    if (!confirm(`¿Dar de baja ${ids.length} lote(s) vencido(s)? Genera movimiento de baja.`)) return
    setBusy(true)
    try {
      const r = await fetch('/api/inventario/baja-vencimiento', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lote_ids: ids }) })
      const j = await r.json(); if (!r.ok) throw new Error(j?.error)
      toast.success(`${j.bajas} lote(s) dados de baja.`); setSel(new Set()); router.refresh()
    } catch (e: any) { toast.error(e?.message ?? 'Error') } finally { setBusy(false) }
  }

  function exportar() {
    exportExcel('vencimientos', rows.map((r) => ({ SKU: r.sku ?? '', Producto: r.nombre, Lote: r.lote ?? '', Sucursal: r.sucursal, Vence: r.fecha, Días: r.dias, Cantidad: r.cantidad, 'Riesgo $': r.riesgo, Acción: r.accion })))
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">$ en riesgo (90d)</div><div className="mt-1 text-2xl font-semibold tabular-nums text-amber-600 dark:text-amber-400">{formatARS(riesgoTotal)}</div></div>
        <div className="rounded-xl border bg-card p-4"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Lotes por vencer</div><div className="mt-1 text-2xl font-semibold tabular-nums">{rows.length}</div></div>
        <div className="rounded-xl border bg-card p-4"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Vencidos</div><div className="mt-1 text-2xl font-semibold tabular-nums text-rose-600 dark:text-rose-400">{vencidos.length}</div></div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {TABS.map((t) => (
            <button key={t.k} onClick={() => setTab(t.k)} className={cn('rounded-full border px-3 py-1 text-xs', tab === t.k ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:bg-accent')}>{t.label} ({counts[t.k]})</button>
          ))}
        </div>
        <div className="flex gap-2">
          {tab === 'vencidos' && vencidos.length > 0 && (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => darDeBaja([...sel])}><Trash2 className="size-4" /> Dar de baja ({sel.size})</Button>
          )}
          <Button asChild variant="outline" size="sm"><Link href="/admin/tareas"><ClipboardList className="size-4" /> Tarea: retirar</Link></Button>
          <Button variant="outline" size="sm" onClick={exportar}><Download className="size-4" /> Excel</Button>
        </div>
      </div>

      {visibles.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-14 text-center">
          <CheckCircle2 className="size-7 text-emerald-500" /><div className="text-sm text-muted-foreground">Sin lotes en este rango.</div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                {tab === 'vencidos' && <th className="px-2 py-2"></th>}
                <th className="px-3 py-2">Producto / lote</th><th className="px-2 py-2">Sucursal</th><th className="px-2 py-2 text-right">Días</th><th className="px-2 py-2 text-right">Cant.</th><th className="px-2 py-2 text-right">Riesgo $</th><th className="px-3 py-2">Acción sugerida</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((r) => (
                <tr key={r.id} className={cn('border-t border-border', r.dias < 0 && 'bg-rose-500/5')}>
                  {tab === 'vencidos' && <td className="px-2 py-1.5"><input type="checkbox" checked={sel.has(r.id)} onChange={(e) => setSel((s) => { const n = new Set(s); e.target.checked ? n.add(r.id) : n.delete(r.id); return n })} className="size-4 accent-[hsl(var(--primary))]" /></td>}
                  <td className="px-3 py-1.5"><div className="font-medium">{r.nombre}</div><div className="text-[10px] text-muted-foreground"><span className="font-mono">{r.sku ?? ''}</span> · lote {r.lote ?? 's/n'} · vence {r.fecha}</div></td>
                  <td className="px-2 py-1.5 text-muted-foreground">{r.sucursal}</td>
                  <td className={cn('px-2 py-1.5 text-right tabular-nums', r.dias < 0 ? 'font-semibold text-rose-600 dark:text-rose-400' : r.dias <= 15 ? 'text-amber-600 dark:text-amber-400' : '')}>{r.dias < 0 ? `−${-r.dias}` : r.dias}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{r.cantidad}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatARS(r.riesgo)}</td>
                  <td className="px-3 py-1.5"><AccionBtn r={r} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function AccionBtn({ r }: { r: LoteRow }) {
  if (r.accion === 'ok') return <span className="text-xs text-emerald-600 dark:text-emerald-400">Se vende a tiempo</span>
  if (r.accion === 'baja') return <span className="text-xs text-rose-600 dark:text-rose-400">Dar de baja</span>
  if (r.accion === 'transferir') return <Button asChild size="sm" variant="outline" className="h-7 text-xs"><Link href="/hub/operaciones/transferencias/nueva"><ArrowRightLeft className="size-3.5" /> Transferir a {r.targetSucNombre}</Link></Button>
  if (r.accion === 'devolver') return <Button asChild size="sm" variant="outline" className="h-7 text-xs"><Link href="/hub/compras/devoluciones/nueva"><Undo2 className="size-3.5" /> Devolver al proveedor</Link></Button>
  return <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => toast.message(`Ofertar −${r.descuento}%`, { description: 'La publicación a la cuponera se integra en una pasada dedicada.' })}><Tag className="size-3.5" /> Ofertar −{r.descuento}%</Button>
}
