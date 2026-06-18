'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Search, Download, Upload, Package, Loader2, SlidersHorizontal } from 'lucide-react'
import { toast } from 'sonner'

import { createClient } from '@/lib/supabase/client'
import { exportExcel } from '@/lib/utils/export-excel'
import { formatARS } from '@/lib/utils/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

export type SucursalLite = { id: string; nombre: string; codigo: string | null }
export type ProductoRow = {
  id: string; sku: string | null; ean: string | null; nombre: string
  laboratorio: string | null; categoria: string | null; costo: number
  total: number; ventaDia: number; cobertura: number | null
  critico: boolean; sinRotacion: boolean; porVencer: boolean; abc: string | null
  stockPorSuc: Record<string, { cantidad: number; min: number; max: number | null }>
}
type Kpis = { productos: number; valorStock: number; criticos: number; porVencer: number }
const ALL = '__all__'

function sem(x?: { cantidad: number; min: number; max: number | null }) {
  if (!x) return { c: 'text-muted-foreground/40', t: '—' }
  if (x.cantidad <= 0) return { c: 'text-rose-600 dark:text-rose-400 font-semibold', t: String(x.cantidad) }
  if (x.cantidad <= x.min) return { c: 'text-amber-600 dark:text-amber-400 font-medium', t: String(x.cantidad) }
  if (x.max != null && x.cantidad > x.max) return { c: 'text-violet-600 dark:text-violet-400', t: String(x.cantidad) }
  return { c: 'text-emerald-600 dark:text-emerald-400', t: String(x.cantidad) }
}

export function StockClient({ productos, sucursales, kpis, rol }: { productos: ProductoRow[]; sucursales: SucursalLite[]; kpis: Kpis; rol: string }) {
  const [tab, setTab] = useState<'productos' | 'kardex'>('productos')
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 border-b border-border">
          {([['productos', 'Productos'], ['kardex', 'Kárdex']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={cn('border-b-2 px-3 py-2 text-sm font-medium transition-colors', tab === k ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>{l}</button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm"><Link href="/hub/operaciones/importaciones"><Upload className="size-4" /> Importar</Link></Button>
        </div>
      </div>
      {tab === 'productos' ? <Productos productos={productos} sucursales={sucursales} kpis={kpis} canEdit={['super_admin','gerente','comprador','administrativo'].includes(rol)} /> : <Kardex sucursales={sucursales} />}
    </div>
  )
}

function Productos({ productos, sucursales, kpis, canEdit }: { productos: ProductoRow[]; sucursales: SucursalLite[]; kpis: Kpis; canEdit: boolean }) {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState(ALL)
  const [lab, setLab] = useState(ALL)
  const [chip, setChip] = useState<'todos' | 'criticos' | 'sin_stock' | 'sin_rotacion'>('todos')
  const [sel, setSel] = useState<ProductoRow | null>(null)

  const cats = useMemo(() => [...new Set(productos.map((p) => p.categoria).filter(Boolean) as string[])].sort(), [productos])
  const labs = useMemo(() => [...new Set(productos.map((p) => p.laboratorio).filter(Boolean) as string[])].sort(), [productos])

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase()
    return productos.filter((p) => {
      if (cat !== ALL && p.categoria !== cat) return false
      if (lab !== ALL && p.laboratorio !== lab) return false
      if (chip === 'criticos' && !p.critico) return false
      if (chip === 'sin_stock' && p.total > 0) return false
      if (chip === 'sin_rotacion' && !p.sinRotacion) return false
      if (term && !`${p.nombre} ${p.sku ?? ''} ${p.ean ?? ''}`.toLowerCase().includes(term)) return false
      return true
    })
  }, [productos, q, cat, lab, chip])

  function exportar() {
    exportExcel('stock', rows.map((p) => ({
      SKU: p.sku ?? '', EAN: p.ean ?? '', Producto: p.nombre, Laboratorio: p.laboratorio ?? '', Categoria: p.categoria ?? '',
      ...Object.fromEntries(sucursales.map((s) => [s.codigo || s.nombre, p.stockPorSuc[s.id]?.cantidad ?? 0])),
      Total: p.total, 'Venta/día': p.ventaDia, 'Cobertura (días)': p.cobertura ?? '', ABC: p.abc ?? '',
    })), { sheet: 'Stock' })
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Productos activos" value={kpis.productos.toLocaleString('es-AR')} />
        <Kpi label="Valor de stock (costo)" value={formatARS(kpis.valorStock)} />
        <Kpi label="Críticos" value={String(kpis.criticos)} tone={kpis.criticos > 0 ? 'bad' : undefined} />
        <Kpi label="Por vencer (30d)" value={String(kpis.porVencer)} tone={kpis.porVencer > 0 ? 'warn' : undefined} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, SKU o EAN…" className="h-9 pl-8" />
        </div>
        <FSelect value={cat} onChange={setCat} ph="Categoría">{cats.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</FSelect>
        <FSelect value={lab} onChange={setLab} ph="Laboratorio">{labs.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</FSelect>
        <Button variant="outline" size="sm" onClick={exportar}><Download className="size-4" /> Excel</Button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {([['todos', 'Todos'], ['criticos', 'Críticos'], ['sin_stock', 'Sin stock'], ['sin_rotacion', 'Sin rotación']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setChip(k)} className={cn('rounded-full border px-2.5 py-1 text-xs transition-colors', chip === k ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:bg-accent')}>{l}</button>
        ))}
      </div>

      <div className="text-xs text-muted-foreground">{rows.length} de {productos.length} productos · <span className="text-emerald-600 dark:text-emerald-400">ok</span> · <span className="text-amber-600 dark:text-amber-400">bajo mínimo</span> · <span className="text-rose-600 dark:text-rose-400">crítico/sin stock</span> · <span className="text-violet-600 dark:text-violet-400">sobrestock</span></div>

      {productos.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center">
          <Package className="size-8 text-muted-foreground" />
          <div><div className="font-medium">Sin stock cargado</div><div className="mt-0.5 text-sm text-muted-foreground">Importá el Excel de stock por sucursal para empezar.</div></div>
          <Button asChild size="sm"><Link href="/hub/operaciones/importaciones"><Upload className="size-4" /> Importar stock</Link></Button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">SKU</th><th className="px-3 py-2">Producto</th>
                {sucursales.map((s) => <th key={s.id} className="px-2 py-2 text-center">{s.codigo || s.nombre}</th>)}
                <th className="px-2 py-2 text-right">Venta/d</th><th className="px-2 py-2 text-right">Cobertura</th><th className="px-2 py-2 text-center">ABC</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 500).map((p) => (
                <tr key={p.id} className="cursor-pointer border-t border-border hover:bg-accent/30" onClick={() => setSel(p)}>
                  <td className="px-3 py-1.5 font-mono text-xs">{p.sku ?? '—'}</td>
                  <td className="px-3 py-1.5"><div className="font-medium">{p.nombre}</div><div className="text-[10px] text-muted-foreground">{p.laboratorio ?? ''}</div></td>
                  {sucursales.map((s) => { const v = sem(p.stockPorSuc[s.id]); return <td key={s.id} className={cn('px-2 py-1.5 text-center tabular-nums', v.c)}>{v.t}</td> })}
                  <td className="px-2 py-1.5 text-right tabular-nums">{p.ventaDia > 0 ? p.ventaDia.toFixed(1) : '—'}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{p.cobertura != null ? `${p.cobertura}d` : '—'}</td>
                  <td className="px-2 py-1.5 text-center">{p.abc ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sel && <DetalleSheet producto={sel} sucursales={sucursales} canEdit={canEdit} onClose={() => setSel(null)} />}
    </div>
  )
}

function DetalleSheet({ producto, sucursales, canEdit, onClose }: { producto: ProductoRow; sucursales: SucursalLite[]; canEdit: boolean; onClose: () => void }) {
  const router = useRouter()
  const sb = createClient()
  const [lotes, setLotes] = useState<any[]>([])
  const [movs, setMovs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [ajuste, setAjuste] = useState<{ suc: string; delta: string; motivo: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const sucName = (id: string) => sucursales.find((s) => s.id === id)?.nombre ?? id.slice(0, 6)

  useEffect(() => {
    let alive = true
    Promise.all([
      sb.from('lotes_productos').select('numero_lote, fecha_vencimiento, cantidad_actual, sucursal_id').eq('producto_id', producto.id).gt('cantidad_actual', 0).order('fecha_vencimiento'),
      sb.from('movimientos_stock').select('tipo, cantidad, motivo, fecha, sucursal_id').eq('producto_id', producto.id).order('fecha', { ascending: false }).limit(20),
    ]).then(([l, m]) => { if (alive) { setLotes(l.data ?? []); setMovs(m.data ?? []); setLoading(false) } })
    return () => { alive = false }
  }, [producto.id])

  async function guardarAjuste() {
    if (!ajuste) return
    const delta = Number(ajuste.delta)
    if (!Number.isFinite(delta) || delta === 0) { toast.error('Ingresá una cantidad ≠ 0 (negativa para restar).'); return }
    if (ajuste.motivo.trim().length < 3) { toast.error('El motivo es obligatorio.'); return }
    setBusy(true)
    try {
      const r = await fetch('/api/inventario/ajuste', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ producto_id: producto.id, sucursal_id: ajuste.suc, delta, motivo: ajuste.motivo.trim() }) })
      const j = await r.json(); if (!r.ok) throw new Error(j?.error)
      toast.success('Ajuste registrado.'); setAjuste(null); onClose(); router.refresh()
    } catch (e: any) { toast.error(e?.message ?? 'Error') } finally { setBusy(false) }
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-lg">
        <SheetHeader><SheetTitle>{producto.nombre}</SheetTitle></SheetHeader>
        <div className="flex flex-1 flex-col gap-4 pt-4 text-sm">
          <div className="text-xs text-muted-foreground">SKU {producto.sku ?? '—'} · EAN {producto.ean ?? '—'} · {producto.laboratorio ?? ''}</div>

          <Section title="Stock por sucursal">
            {sucursales.map((s) => { const x = producto.stockPorSuc[s.id]; const v = sem(x); return (
              <div key={s.id} className="flex items-center justify-between border-b border-border/60 py-1 last:border-0">
                <span>{s.nombre}</span>
                <span className="flex items-center gap-2">
                  <span className={cn('tabular-nums', v.c)}>{x?.cantidad ?? 0}</span>
                  {canEdit && <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={() => setAjuste({ suc: s.id, delta: '', motivo: '' })}>Ajustar</Button>}
                </span>
              </div>
            )})}
          </Section>

          {ajuste && (
            <div className="rounded-md border border-primary/40 bg-nora-bg p-3 space-y-2">
              <div className="text-xs font-medium">Ajustar stock · {sucName(ajuste.suc)}</div>
              <Input type="number" placeholder="Delta (ej. -3 resta, 5 suma)" value={ajuste.delta} onChange={(e) => setAjuste({ ...ajuste, delta: e.target.value })} />
              <Textarea rows={2} placeholder="Motivo (obligatorio)" value={ajuste.motivo} onChange={(e) => setAjuste({ ...ajuste, motivo: e.target.value })} />
              <div className="flex gap-2"><Button size="sm" disabled={busy} onClick={guardarAjuste}>{busy ? 'Guardando…' : 'Registrar ajuste'}</Button><Button size="sm" variant="ghost" onClick={() => setAjuste(null)}>Cancelar</Button></div>
            </div>
          )}

          <Section title={`Lotes (${lotes.length})`}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : lotes.length === 0 ? <span className="text-muted-foreground">Sin lotes.</span> : lotes.map((l, i) => (
              <div key={i} className="flex items-center justify-between border-b border-border/60 py-1 last:border-0 text-xs">
                <span>{l.numero_lote || 's/lote'} · {sucName(l.sucursal_id)}</span><span className="tabular-nums">{l.cantidad_actual} u · vence {l.fecha_vencimiento}</span>
              </div>
            ))}
          </Section>

          <Section title="Movimientos recientes">
            {loading ? <Loader2 className="size-4 animate-spin" /> : movs.length === 0 ? <span className="text-muted-foreground">Sin movimientos.</span> : movs.map((m, i) => (
              <div key={i} className="flex items-center justify-between border-b border-border/60 py-1 last:border-0 text-xs">
                <span>{m.tipo} · {sucName(m.sucursal_id)}</span><span className={cn('tabular-nums', Number(m.cantidad) < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400')}>{Number(m.cantidad) > 0 ? '+' : ''}{m.cantidad}</span>
              </div>
            ))}
          </Section>

          <Button asChild variant="outline"><Link href="/hub/operaciones/transferencias/nueva">Crear transferencia</Link></Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function Kardex({ sucursales }: { sucursales: SucursalLite[] }) {
  const sb = createClient()
  const [suc, setSuc] = useState(ALL)
  const [tipo, setTipo] = useState(ALL)
  const [rows, setRows] = useState<any[] | null>(null)

  useEffect(() => {
    let alive = true
    let q = sb.from('movimientos_stock').select('tipo, cantidad, motivo, fecha, sucursal_id, producto_id, productos_catalogo(nombre, sku)').order('fecha', { ascending: false }).limit(500)
    if (suc !== ALL) q = q.eq('sucursal_id', suc)
    if (tipo !== ALL) q = q.eq('tipo', tipo)
    q.then((r) => { if (alive) setRows(r.data ?? []) })
    return () => { alive = false }
  }, [suc, tipo])

  const sucName = (id: string) => sucursales.find((s) => s.id === id)?.nombre ?? id.slice(0, 6)
  const TIPOS = ['venta', 'ajuste_pos', 'ajuste_neg', 'recepcion', 'transferencia_in', 'transferencia_out', 'baja_vencimiento', 'conteo', 'import_diferencia']

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <FSelect value={suc} onChange={setSuc} ph="Sucursal">{sucursales.map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}</FSelect>
        <FSelect value={tipo} onChange={setTipo} ph="Tipo">{TIPOS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</FSelect>
        <Button variant="outline" size="sm" disabled={!rows?.length} onClick={() => exportExcel('kardex', (rows ?? []).map((m: any) => ({ Fecha: m.fecha?.slice(0, 16).replace('T', ' '), SKU: m.productos_catalogo?.sku ?? '', Producto: m.productos_catalogo?.nombre ?? '', Sucursal: sucName(m.sucursal_id), Tipo: m.tipo, Cantidad: m.cantidad, Motivo: m.motivo ?? '' })))}><Download className="size-4" /> Excel</Button>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2">Fecha</th><th className="px-3 py-2">Producto</th><th className="px-3 py-2">Sucursal</th><th className="px-3 py-2">Tipo</th><th className="px-3 py-2 text-right">Cant.</th><th className="px-3 py-2">Motivo</th></tr></thead>
          <tbody>
            {rows == null ? <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground"><Loader2 className="mx-auto size-5 animate-spin" /></td></tr>
              : rows.length === 0 ? <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground"><SlidersHorizontal className="mx-auto mb-2 size-6" />Sin movimientos.</td></tr>
              : rows.map((m: any, i: number) => (
                <tr key={i} className="border-t border-border">
                  <td className="px-3 py-1.5 text-xs">{m.fecha?.slice(0, 16).replace('T', ' ')}</td>
                  <td className="px-3 py-1.5"><span className="font-mono text-[10px] text-muted-foreground">{m.productos_catalogo?.sku ?? ''}</span> {m.productos_catalogo?.nombre ?? '—'}</td>
                  <td className="px-3 py-1.5">{sucName(m.sucursal_id)}</td><td className="px-3 py-1.5">{m.tipo}</td>
                  <td className={cn('px-3 py-1.5 text-right tabular-nums', Number(m.cantidad) < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400')}>{Number(m.cantidad) > 0 ? '+' : ''}{m.cantidad}</td>
                  <td className="px-3 py-1.5 text-xs text-muted-foreground">{m.motivo ?? ''}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: 'warn' | 'bad' }) {
  const c = tone === 'warn' ? 'text-amber-600 dark:text-amber-400' : tone === 'bad' ? 'text-destructive' : 'text-foreground'
  return <div className="rounded-xl border bg-card p-4"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div><div className={cn('mt-1 text-2xl font-semibold tabular-nums', c)}>{value}</div></div>
}
function FSelect({ value, onChange, ph, children }: { value: string; onChange: (v: string) => void; ph: string; children: React.ReactNode }) {
  return <Select value={value} onValueChange={onChange}><SelectTrigger className="h-9 w-[150px] text-xs"><SelectValue placeholder={ph} /></SelectTrigger><SelectContent><SelectItem value={ALL}>{ph}: todas</SelectItem>{children}</SelectContent></Select>
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{title}</div><div>{children}</div></div>
}
