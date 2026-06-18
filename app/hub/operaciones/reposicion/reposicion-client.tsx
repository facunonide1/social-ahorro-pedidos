'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Download, ShoppingCart, AlertTriangle, Ban } from 'lucide-react'

import { exportExcel } from '@/lib/utils/export-excel'
import { formatARS } from '@/lib/utils/format'
import { NoraCard } from '@/components/nora/nora-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

export type RepoRow = {
  producto_id: string; sku: string | null; nombre: string; laboratorio: string | null
  sucursal_id: string; sucursal: string; stock: number; stockMax: number | null
  ventaDia: number; diasRestantes: number | null; costo: number; drogueria: string | null
}
type Suc = { id: string; nombre: string; codigo: string | null }
const ALL = '__all__'

export function ReposicionClient({ rows, sucursales }: { rows: RepoRow[]; sucursales: Suc[] }) {
  const [dias, setDias] = useState(15)
  const [suc, setSuc] = useState(ALL)
  const [cant, setCant] = useState<Record<string, number>>({})

  const base = useMemo(() => suc === ALL ? rows : rows.filter((r) => r.sucursal_id === suc), [rows, suc])

  const comprar = useMemo(() => base
    .map((r) => {
      const sugerido = Math.max(0, Math.ceil(r.ventaDia * dias - r.stock))
      return { ...r, sugerido }
    })
    .filter((r) => r.sugerido > 0)
    .sort((a, b) => (a.diasRestantes ?? 999) - (b.diasRestantes ?? 999)),
    [base, dias])

  const noComprar = useMemo(() => base.filter((r) => {
    const sobrestock = r.stockMax != null ? r.stock > r.stockMax : r.ventaDia > 0 && r.stock > r.ventaDia * dias * 2
    const sinRot = r.ventaDia === 0 && r.stock > 0
    return sobrestock || sinRot
  }), [base, dias])

  const key = (r: RepoRow) => `${r.producto_id}|${r.sucursal_id}`
  const qty = (r: RepoRow & { sugerido: number }) => cant[key(r)] ?? r.sugerido
  const costoTotal = comprar.reduce((a, r) => a + qty(r) * r.costo, 0)

  // Agrupar por droguería para generar órdenes
  const porDrogueria = useMemo(() => {
    const m = new Map<string, (RepoRow & { sugerido: number })[]>()
    for (const r of comprar) { const d = r.drogueria ?? 'Sin droguería'; const a = m.get(d) ?? []; a.push(r); m.set(d, a) }
    return [...m.entries()]
  }, [comprar])

  function exportarDrogueria(drog: string, items: (RepoRow & { sugerido: number })[]) {
    exportExcel(`orden-${drog.replace(/\s+/g, '-').toLowerCase()}`, items.map((r) => ({
      SKU: r.sku ?? '', Producto: r.nombre, Sucursal: r.sucursal, Cantidad: qty(r), 'Costo estimado': qty(r) * r.costo,
    })), { sheet: drog.slice(0, 28) })
  }

  return (
    <div className="space-y-4">
      <NoraCard contexto="reposición">
        {comprar.length === 0 ? (
          <p>No hay sugerencias de compra (faltan ventas registradas, o el stock cubre la cobertura objetivo).</p>
        ) : (
          <p>Sugiero reponer <b>{comprar.length}</b> ítems por <b>{formatARS(costoTotal)}</b> para asegurar {dias} días de cobertura. Prioricé los de quiebre inminente. {porDrogueria.length} droguería{porDrogueria.length === 1 ? '' : 's'} para generar la orden.</p>
        )}
      </NoraCard>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Días de cobertura objetivo</Label>
          <Input type="number" min={1} value={dias} onChange={(e) => setDias(Math.max(1, Number(e.target.value) || 1))} className="w-[140px]" />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Sucursal</Label>
          <Select value={suc} onValueChange={setSuc}><SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value={ALL}>Todas</SelectItem>{sucursales.map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}</SelectContent></Select>
        </div>
        <Button asChild variant="outline"><Link href="/admin/tareas">Tarea: comprar</Link></Button>
      </div>

      {/* Comprar */}
      <section>
        <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><ShoppingCart className="size-4 text-primary" /> A reponer ({comprar.length})</h2>
        {comprar.length === 0 ? (
          <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">Nada para reponer con {dias} días de cobertura.</div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2">SKU</th><th className="px-3 py-2">Producto</th><th className="px-2 py-2">Sucursal</th><th className="px-2 py-2 text-right">Stock</th><th className="px-2 py-2 text-right">Venta/d</th><th className="px-2 py-2 text-right">Días</th><th className="px-2 py-2 text-right">Sugerido</th><th className="px-2 py-2 text-right">Costo</th><th className="px-2 py-2">Droguería</th></tr></thead>
              <tbody>
                {comprar.slice(0, 300).map((r) => (
                  <tr key={key(r)} className={cn('border-t border-border', (r.diasRestantes ?? 99) <= 3 && 'bg-rose-500/5')}>
                    <td className="px-3 py-1.5 font-mono text-xs">{r.sku ?? '—'}</td>
                    <td className="px-3 py-1.5"><div className="font-medium">{r.nombre}</div></td>
                    <td className="px-2 py-1.5 text-muted-foreground">{r.sucursal}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{r.stock}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{r.ventaDia.toFixed(1)}</td>
                    <td className={cn('px-2 py-1.5 text-right tabular-nums', (r.diasRestantes ?? 99) <= 3 && 'font-semibold text-rose-600 dark:text-rose-400')}>{r.diasRestantes != null ? `${r.diasRestantes}d` : '—'}</td>
                    <td className="px-2 py-1.5 text-right"><Input type="number" value={qty(r)} onChange={(e) => setCant((c) => ({ ...c, [key(r)]: Math.max(0, Number(e.target.value) || 0) }))} className="ml-auto h-7 w-16 text-right tabular-nums" /></td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatARS(qty(r) * r.costo)}</td>
                    <td className="px-2 py-1.5 text-xs">{r.drogueria ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Generar orden por droguería */}
      {porDrogueria.length > 0 && (
        <section className="rounded-lg border border-border p-3">
          <h3 className="mb-2 text-sm font-semibold">Generar orden por droguería</h3>
          <div className="flex flex-wrap gap-2">
            {porDrogueria.map(([drog, items]) => (
              <Button key={drog} variant="outline" size="sm" onClick={() => exportarDrogueria(drog, items)}>
                <Download className="size-4" /> {drog} ({items.length})
              </Button>
            ))}
          </div>
        </section>
      )}

      {/* NO comprar */}
      {noComprar.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-amber-600 dark:text-amber-400"><Ban className="size-4" /> NO comprar ({noComprar.length})</h2>
          <div className="overflow-x-auto rounded-lg border border-amber-500/30">
            <table className="w-full text-sm">
              <thead className="bg-amber-500/5 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2">Producto</th><th className="px-2 py-2">Sucursal</th><th className="px-2 py-2 text-right">Stock</th><th className="px-2 py-2 text-right">Venta/d</th><th className="px-2 py-2">Motivo</th></tr></thead>
              <tbody>
                {noComprar.slice(0, 100).map((r) => (
                  <tr key={key(r)} className="border-t border-amber-500/20">
                    <td className="px-3 py-1.5"><span className="font-mono text-[10px] text-muted-foreground">{r.sku ?? ''}</span> {r.nombre}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{r.sucursal}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{r.stock}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{r.ventaDia.toFixed(1)}</td>
                    <td className="px-2 py-1.5 text-xs text-amber-600 dark:text-amber-400">{r.ventaDia === 0 ? 'sin rotación' : 'sobrestock'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
