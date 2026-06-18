'use client'

import { useMemo, useState } from 'react'
import { Download, TrendingUp, TrendingDown, Sparkles, Moon, Package } from 'lucide-react'

import { exportExcel } from '@/lib/utils/export-excel'
import { formatARS } from '@/lib/utils/format'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

export type VendidoRow = {
  id: string; sku: string | null; nombre: string; categoria: string | null; laboratorio: string | null
  u7: number; u30: number; u90: number; facturacion30: number; tendencia: number; abc: string | null
  porSuc: Record<string, number>
}
export type DormidoRow = { id: string; sku: string | null; nombre: string; categoria: string | null; stock: number; costo: number; inmovilizado: number }
type Suc = { id: string; nombre: string; codigo: string | null }

export function AnalisisClient({ masVendidos, dineroDormido, sucursales, totalInmovilizado, hayVentas }: {
  masVendidos: VendidoRow[]; dineroDormido: DormidoRow[]; sucursales: Suc[]; totalInmovilizado: number; hayVentas: boolean
}) {
  const [tab, setTab] = useState<'vendidos' | 'dormido'>('vendidos')
  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-border">
        {([['vendidos', 'Más vendidos'], ['dormido', 'Dinero dormido']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={cn('border-b-2 px-3 py-2 text-sm font-medium transition-colors', tab === k ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>{l}</button>
        ))}
      </div>
      {!hayVentas && (
        <div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Todavía no hay ventas registradas. Importá stock unos días (o cargá el demo) y el cron <code>metricas-stock</code> poblará rotación y rankings.
        </div>
      )}
      {tab === 'vendidos' ? <MasVendidos rows={masVendidos} sucursales={sucursales} /> : <DineroDormido rows={dineroDormido} total={totalInmovilizado} />}
    </div>
  )
}

function MasVendidos({ rows, sucursales }: { rows: VendidoRow[]; sucursales: Suc[] }) {
  const [periodo, setPeriodo] = useState<'7' | '30' | '90'>('30')
  const [suc, setSuc] = useState('__all__')
  const val = (r: VendidoRow) => suc === '__all__' ? (periodo === '7' ? r.u7 : periodo === '30' ? r.u30 : r.u90) : (r.porSuc[suc] ?? 0)
  const ranked = useMemo(() => [...rows].map((r) => ({ r, v: val(r) })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v), [rows, periodo, suc])
  const max = ranked[0]?.v ?? 1
  const reponer = ranked.filter((x) => x.r.abc === 'A').slice(0, 5)
  const noComprar = [...rows].filter((r) => r.u90 === 0).slice(0, 5)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={periodo} onValueChange={(v) => setPeriodo(v as any)}><SelectTrigger className="h-9 w-[130px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="7">Últimos 7 días</SelectItem><SelectItem value="30">Últimos 30 días</SelectItem><SelectItem value="90">Últimos 90 días</SelectItem></SelectContent></Select>
        <Select value={suc} onValueChange={setSuc}><SelectTrigger className="h-9 w-[150px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="__all__">Todas las sucursales</SelectItem>{sucursales.map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}</SelectContent></Select>
        <Button variant="outline" size="sm" disabled={!ranked.length} onClick={() => exportExcel(`mas-vendidos-${periodo}d`, ranked.map(({ r, v }) => ({ SKU: r.sku ?? '', Producto: r.nombre, Categoria: r.categoria ?? '', [`Unidades ${periodo}d`]: v, 'Facturación 30d': r.facturacion30, 'Tendencia %': r.tendencia, ABC: r.abc ?? '' })))}><Download className="size-4" /> Excel</Button>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <NoraBox tone="ok" icon={<Sparkles className="size-4" />} title="NORA sugiere reponer (clase A)" items={reponer.map((x) => `${x.r.nombre} — ${x.v} u`)} empty="Sin productos clase A todavía." />
        <NoraBox tone="warn" icon={<Moon className="size-4" />} title="NORA: NO comprar (sin ventas 90d)" items={noComprar.map((r) => r.nombre)} empty="Todo rota." />
      </div>

      {ranked.length === 0 ? <EmptyAnalisis /> : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2">#</th><th className="px-3 py-2">Producto</th><th className="px-3 py-2">Unidades</th><th className="px-3 py-2 text-right">Facturación 30d</th><th className="px-3 py-2 text-center">Tend.</th><th className="px-3 py-2 text-center">ABC</th></tr></thead>
            <tbody>
              {ranked.slice(0, 100).map(({ r, v }, i) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                  <td className="px-3 py-1.5"><div className="font-medium">{r.nombre}</div><div className="font-mono text-[10px] text-muted-foreground">{r.sku ?? ''}</div></td>
                  <td className="px-3 py-1.5"><div className="flex items-center gap-2"><div className="h-2 w-24 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.round((v / max) * 100)}%` }} /></div><span className="tabular-nums">{v}</span></div></td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{formatARS(r.facturacion30)}</td>
                  <td className={cn('px-3 py-1.5 text-center text-xs', r.tendencia >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>{r.tendencia >= 0 ? <TrendingUp className="inline size-3" /> : <TrendingDown className="inline size-3" />} {r.tendencia > 0 ? '+' : ''}{r.tendencia}%</td>
                  <td className="px-3 py-1.5 text-center">{r.abc ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function DineroDormido({ rows, total }: { rows: DormidoRow[]; total: number }) {
  const porCat = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of rows) m.set(r.categoria ?? 'otros', (m.get(r.categoria ?? 'otros') ?? 0) + r.inmovilizado)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [rows])
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <div className="rounded-xl border bg-card p-4"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">$ inmovilizado</div><div className="mt-1 text-2xl font-semibold tabular-nums text-amber-600 dark:text-amber-400">{formatARS(total)}</div></div>
        <div className="rounded-xl border bg-card p-4"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Productos dormidos</div><div className="mt-1 text-2xl font-semibold tabular-nums">{rows.length}</div></div>
        <div className="rounded-xl border bg-card p-4"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Peor categoría</div><div className="mt-1 text-base font-semibold">{porCat[0] ? `${porCat[0][0]} · ${formatARS(porCat[0][1])}` : '—'}</div></div>
      </div>
      <div className="flex justify-end">
        <Button variant="outline" size="sm" disabled={!rows.length} onClick={() => exportExcel('dinero-dormido', rows.map((r) => ({ SKU: r.sku ?? '', Producto: r.nombre, Categoria: r.categoria ?? '', Stock: r.stock, Costo: r.costo, Inmovilizado: r.inmovilizado })))}><Download className="size-4" /> Excel</Button>
      </div>
      {rows.length === 0 ? <div className="rounded-lg border border-dashed py-14 text-center text-sm text-muted-foreground"><Moon className="mx-auto mb-2 size-7" />No hay dinero dormido (o falta cargar ventas).</div> : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2">Producto</th><th className="px-3 py-2">Categoría</th><th className="px-3 py-2 text-right">Stock</th><th className="px-3 py-2 text-right">Costo u.</th><th className="px-3 py-2 text-right">Inmovilizado</th></tr></thead>
            <tbody>{rows.slice(0, 100).map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-3 py-1.5"><div className="font-medium">{r.nombre}</div><div className="font-mono text-[10px] text-muted-foreground">{r.sku ?? ''}</div></td>
                <td className="px-3 py-1.5 text-muted-foreground">{r.categoria ?? '—'}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{r.stock}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{formatARS(r.costo)}</td>
                <td className="px-3 py-1.5 text-right font-medium tabular-nums text-amber-600 dark:text-amber-400">{formatARS(r.inmovilizado)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function NoraBox({ tone, icon, title, items, empty }: { tone: 'ok' | 'warn'; icon: React.ReactNode; title: string; items: string[]; empty: string }) {
  return (
    <div className={cn('rounded-lg border-l-[3px] p-3', tone === 'ok' ? 'border-l-emerald-500 bg-emerald-500/5' : 'border-l-amber-500 bg-amber-500/5')}>
      <div className={cn('mb-1.5 flex items-center gap-1.5 text-xs font-medium', tone === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400')}>{icon} {title}</div>
      {items.length === 0 ? <div className="text-xs text-muted-foreground">{empty}</div> : <ul className="space-y-0.5 text-sm">{items.map((t, i) => <li key={i} className="truncate">• {t}</li>)}</ul>}
    </div>
  )
}
function EmptyAnalisis() {
  return <div className="rounded-lg border border-dashed py-14 text-center text-sm text-muted-foreground"><Package className="mx-auto mb-2 size-7" />Sin ventas en el período.</div>
}
