'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClock, Plus, Search, Trash2, Loader2, AlertTriangle, ArrowUpFromLine, Tag, Truck, ListChecks, Check } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import type { VencimientoRow, AccionVenc } from '@/lib/operaciones/vencimientos'

type Suc = { id: string; nombre: string }
type Resumen = { total: number; urgentes: number; valor_riesgo: number; valor_urgente: number; vencidos: number }
type Carga = { producto_id: string | null; sku: string | null; nombre: string; fecha: string; cantidad: string; ubicacion: 'gondola' | 'deposito'; sucursal_id: string }

const ACCION_ICON: Record<AccionVenc, any> = { reponer: ArrowUpFromLine, oferta: Tag, transferir: Truck, baja: AlertTriangle, vigilar: CalendarClock }

export function VencimientosClient({ filas, resumen, sucursales, sucursalActiva, esTodas }: {
  filas: VencimientoRow[]; resumen: Resumen; sucursales: Suc[]; sucursalActiva: string | null; esTodas: boolean
}) {
  const router = useRouter()
  const [cargar, setCargar] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  async function resolver(r: VencimientoRow, resolucion: AccionVenc) {
    if (resolucion === 'oferta') { router.push('/admin/ofertas'); return }
    if (resolucion === 'transferir') { router.push('/admin/operaciones/transferencias'); return }
    setBusy(r.id)
    try {
      const res = await fetch('/api/operaciones/vencimientos', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accion: 'resolver', id: r.id, resolucion, producto: r.producto, sucursal_id: r.sucursal_id }),
      })
      const j = await res.json(); if (!res.ok) throw new Error(j?.error)
      toast.success(resolucion === 'reponer' ? 'Tarea de reposición creada.' : resolucion === 'tarea' ? 'Tarea creada.' : 'Marcado como resuelto.')
      router.refresh()
    } catch (e: any) { toast.error(e?.message ?? 'Error') } finally { setBusy(null) }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Por vencer" value={String(resumen.total)} sub={`${resumen.vencidos} ya vencidos`} cls="text-amber-600" />
        <Kpi label="Urgentes (≤30d)" value={String(resumen.urgentes)} sub="requieren acción" cls="text-rose-600" />
        <Kpi label="$ en riesgo" value={`$${resumen.valor_riesgo.toLocaleString('es-AR')}`} sub="al costo" cls="text-rose-600" />
        <Kpi label="$ urgente" value={`$${resumen.valor_urgente.toLocaleString('es-AR')}`} sub="vence en ≤30 días" cls="text-amber-600" />
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">Ordenado por plata en riesgo</div>
        <Button onClick={() => setCargar(true)}><Plus className="size-4" /> Cargar vencimientos</Button>
      </div>

      {filas.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">Sin vencimientos cargados. Cuando controles la mercadería, cargá los que estén por vencer.</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr>
              <th className="px-3 py-2">Producto</th>{esTodas && <th className="px-3 py-2">Sucursal</th>}
              <th className="px-3 py-2 text-right">Vence</th><th className="px-3 py-2 text-right">Cant.</th>
              <th className="px-3 py-2">Dónde</th><th className="px-3 py-2 text-right">Góndola</th>
              <th className="px-3 py-2 text-right">$ riesgo</th><th className="px-3 py-2">NORA sugiere</th>
            </tr></thead>
            <tbody>
              {filas.map((r) => {
                const AccIcon = ACCION_ICON[r.accion]
                const urgente = r.dias_restantes <= 30
                return (
                  <tr key={r.id} className="border-t border-border/60 align-top">
                    <td className="px-3 py-2"><div className="font-medium">{r.producto}</div><div className="font-mono text-[10px] text-muted-foreground">{r.sku}</div></td>
                    {esTodas && <td className="px-3 py-2 text-xs">{r.sucursal}</td>}
                    <td className="px-3 py-2 text-right"><div className="text-xs">{r.fecha_vencimiento}</div><div className={cn('text-[11px] font-medium', r.dias_restantes <= 0 ? 'text-rose-600' : urgente ? 'text-amber-600' : 'text-muted-foreground')}>{r.dias_restantes <= 0 ? 'vencido' : `en ${r.dias_restantes}d`}</div></td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.cantidad}</td>
                    <td className="px-3 py-2 text-xs">{r.ubicacion}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{r.stock_gondola}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium text-rose-600">${r.valor_riesgo.toLocaleString('es-AR')}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5 text-xs"><AccIcon className="size-3.5 text-primary" /><span className="font-medium">{r.accion_label}</span></div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">{r.motivo}</div>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {r.accion !== 'vigilar' && <Button size="sm" variant="default" className="h-6 px-2 text-[11px]" disabled={busy === r.id} onClick={() => resolver(r, r.accion)}>{r.accion_label}</Button>}
                        <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => resolver(r, 'oferta')}>Oferta</Button>
                        <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => resolver(r, 'transferir')}>Transferir</Button>
                        <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" disabled={busy === r.id} onClick={() => resolver(r, 'tarea')}>Tarea</Button>
                        <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px] text-emerald-600" disabled={busy === r.id} onClick={() => resolver(r, 'baja')}><Check className="size-3" /></Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {cargar && <CargarSheet sucursales={sucursales} sucursalActiva={sucursalActiva} onClose={() => setCargar(false)} />}
    </div>
  )
}

function CargarSheet({ sucursales, sucursalActiva, onClose }: { sucursales: Suc[]; sucursalActiva: string | null; onClose: () => void }) {
  const router = useRouter()
  const [sucursal, setSucursal] = useState(sucursalActiva ?? '')
  const [items, setItems] = useState<Carga[]>([])
  const [q, setQ] = useState(''); const [matches, setMatches] = useState<any[]>([])
  const [busy, setBusy] = useState(false)
  const deb = useRef<any>(null)

  useEffect(() => {
    const t = q.trim()
    if (deb.current) clearTimeout(deb.current)
    if (t.length < 2) { setMatches([]); return }
    deb.current = setTimeout(async () => {
      try { const r = await fetch(`/api/ofertas/buscar-producto?q=${encodeURIComponent(t)}`); const j = await r.json(); setMatches(Array.isArray(j) ? j : []) } catch { setMatches([]) }
    }, 250)
  }, [q])

  function add(p: any) {
    setItems((x) => [...x, { producto_id: p.id, sku: p.sku, nombre: p.nombre, fecha: '', cantidad: '1', ubicacion: 'gondola', sucursal_id: sucursal }])
    setQ(''); setMatches([])
  }
  function upd(i: number, patch: Partial<Carga>) { setItems((x) => x.map((it, j) => j === i ? { ...it, ...patch } : it)) }

  async function submit() {
    const listos = items.filter((i) => i.fecha && Number(i.cantidad) > 0)
    if (!listos.length) { toast.error('Cargá producto, fecha y cantidad.'); return }
    setBusy(true)
    try {
      const r = await fetch('/api/operaciones/vencimientos', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accion: 'cargar', items: listos.map((i) => ({ producto_id: i.producto_id, sku: i.sku, sucursal_id: i.sucursal_id || sucursal, fecha_vencimiento: i.fecha, cantidad: Number(i.cantidad), ubicacion: i.ubicacion })) }),
      })
      const j = await r.json(); if (!r.ok) throw new Error(j?.error)
      toast.success(`${j.cargados} vencimiento(s) cargado(s).`); onClose(); router.refresh()
    } catch (e: any) { toast.error(e?.message ?? 'Error') } finally { setBusy(false) }
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-lg">
        <SheetHeader><SheetTitle>Cargar vencimientos</SheetTitle></SheetHeader>
        <div className="flex flex-1 flex-col gap-3 pt-4">
          <div><Label className="text-xs">Sucursal</Label><Select value={sucursal} onValueChange={setSucursal}><SelectTrigger><SelectValue placeholder="Sucursal" /></SelectTrigger><SelectContent>{sucursales.map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}</SelectContent></Select></div>
          <div className="relative"><Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto por SKU/nombre/EAN…" className="pl-8" disabled={!sucursal} /></div>
          {matches.length > 0 && <div className="rounded-md border border-border">{matches.map((m) => <button key={m.id} type="button" onClick={() => add(m)} className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-accent"><span className="truncate">{m.nombre}</span><span className="font-mono text-[10px] text-muted-foreground">{m.sku}</span></button>)}</div>}

          {items.map((it, i) => (
            <div key={i} className="rounded-md border border-border p-2">
              <div className="flex items-center justify-between"><span className="text-sm font-medium">{it.nombre}</span><Button size="icon" variant="ghost" className="size-6 text-rose-600" onClick={() => setItems((x) => x.filter((_, j) => j !== i))}><Trash2 className="size-3.5" /></Button></div>
              <div className="mt-1.5 grid grid-cols-3 gap-2">
                <div><Label className="text-[10px]">Vence</Label><Input type="date" value={it.fecha} onChange={(e) => upd(i, { fecha: e.target.value })} className="h-8" /></div>
                <div><Label className="text-[10px]">Cantidad</Label><Input type="number" value={it.cantidad} onChange={(e) => upd(i, { cantidad: e.target.value })} className="h-8" /></div>
                <div><Label className="text-[10px]">Dónde</Label><Select value={it.ubicacion} onValueChange={(v) => upd(i, { ubicacion: v as any })}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="gondola">góndola</SelectItem><SelectItem value="deposito">depósito</SelectItem></SelectContent></Select></div>
              </div>
            </div>
          ))}

          <Button size="lg" disabled={busy || !items.length} onClick={submit} className="mt-1">{busy ? <Loader2 className="size-4 animate-spin" /> : <ListChecks className="size-4" />} Cargar {items.length || ''} vencimiento(s)</Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function Kpi({ label, value, sub, cls }: { label: string; value: string; sub: string; cls: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn('mt-1 text-xl font-semibold tabular-nums', cls)}>{value}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </div>
  )
}
