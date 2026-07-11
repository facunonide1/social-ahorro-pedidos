'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClock, Plus, Search, Trash2, Loader2, AlertTriangle, ArrowUpFromLine, Tag, Truck, ListChecks, Check, Undo2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import type { VencimientoRow, AccionVenc } from '@/lib/operaciones/vencimientos'

type Suc = { id: string; nombre: string }
type Prov = { id: string; razon_social: string; dias_ventana_devolucion: number | null }
type Resumen = { total: number; urgentes: number; valor_riesgo: number; valor_urgente: number; vencidos: number; recuperable_devolviendo: number; devolver_count: number; ventana_por_cerrar: number; ventana_por_cerrar_monto: number }
type Carga = { producto_id: string | null; sku: string | null; nombre: string; fecha: string; cantidad: string; ubicacion: 'gondola' | 'deposito'; sucursal_id: string }

const ACCION_ICON: Record<AccionVenc, any> = { devolver: Undo2, reponer: ArrowUpFromLine, transferir: Truck, liquidar: Tag, baja: AlertTriangle, vigilar: CalendarClock }
const money = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`

export function VencimientosClient({ filas, resumen, sucursales, proveedores, sucursalActiva, esTodas }: {
  filas: VencimientoRow[]; resumen: Resumen; sucursales: Suc[]; proveedores: Prov[]; sucursalActiva: string | null; esTodas: boolean
}) {
  const router = useRouter()
  const [cargar, setCargar] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [devolver, setDevolver] = useState<VencimientoRow | null>(null)

  async function ejecutar(r: VencimientoRow, accion: AccionVenc) {
    if (accion === 'devolver') { setDevolver(r); return }
    if (accion === 'liquidar') { router.push(`/admin/ofertas?sku=${encodeURIComponent(r.sku ?? '')}&desc=${r.descuento_pct ?? ''}`); return }
    if (accion === 'transferir') { router.push(`/admin/operaciones/transferencias/nueva?sku=${encodeURIComponent(r.sku ?? '')}&cantidad=${r.cantidad}`); return }
    // reponer / baja / tarea → API resolver (origen-aware)
    const resolucion = accion === 'reponer' ? 'reponer' : 'baja'
    setBusy(r.id)
    try {
      const res = await fetch('/api/operaciones/vencimientos', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accion: 'resolver', origen: r.origen, id: r.origen === 'manual' ? r.id : null, lote_id: r.lote_id, resolucion, producto: r.producto, producto_id: r.producto_id, sucursal_id: r.sucursal_id, cantidad: r.cantidad, costo: r.costo }),
      })
      const j = await res.json(); if (!res.ok) throw new Error(j?.error)
      toast.success(resolucion === 'reponer' ? 'Tarea de reposición creada.' : 'Marcado como resuelto.')
      router.refresh()
    } catch (e: any) { toast.error(e?.message ?? 'Error') } finally { setBusy(null) }
  }

  return (
    <div className="space-y-4">
      {/* Franja NORA: plata recuperable devolviendo */}
      {resumen.recuperable_devolviendo > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5 text-sm text-primary">
          <Sparkles className="size-4 shrink-0" />
          <span className="flex-1">
            <b>{money(resumen.recuperable_devolviendo)}</b> recuperables devolviendo hoy los <b>{resumen.devolver_count}</b> SKU con devolución posible.
            {resumen.ventana_por_cerrar > 0 && <span className="text-rose-600 dark:text-rose-400"> {resumen.ventana_por_cerrar} con ventana por cerrar ({money(resumen.ventana_por_cerrar_monto)}) — no las dejes pasar.</span>}
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Por vencer" value={String(resumen.total)} sub={`${resumen.vencidos} ya vencidos`} cls="text-amber-600" />
        <Kpi label="$ en riesgo" value={money(resumen.valor_riesgo)} sub="al costo" cls="text-rose-600" />
        <Kpi label="$ recuperable" value={money(resumen.recuperable_devolviendo)} sub="devolviendo a droguería" cls="text-emerald-600" />
        <Kpi label="Ventana por cerrar" value={String(resumen.ventana_por_cerrar)} sub="≤7 días para devolver" cls="text-rose-600" />
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">Ordenado por urgencia de ventana de devolución</div>
        <Button onClick={() => setCargar(true)}><Plus className="size-4" /> Cargar vencimientos</Button>
      </div>

      {filas.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">Sin vencimientos. Se leen la carga manual y los lotes de recepción con fecha.</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr>
              <th className="px-3 py-2">Producto</th>{esTodas && <th className="px-3 py-2">Sucursal</th>}
              <th className="px-3 py-2 text-right">Vence</th><th className="px-3 py-2 text-right">Ventana cierra</th>
              <th className="px-3 py-2 text-right">Gón/Dep</th><th className="px-3 py-2 text-right">Días stock</th>
              <th className="px-3 py-2 text-right">$ en juego</th><th className="px-3 py-2">NORA sugiere</th>
            </tr></thead>
            <tbody>
              {filas.map((r) => {
                const AccIcon = ACCION_ICON[r.accion]
                return (
                  <tr key={`${r.origen}-${r.id}`} className="border-t border-border/60 align-top">
                    <td className="px-3 py-2">
                      <div className="font-medium">{r.producto}</div>
                      <div className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
                        {r.sku}
                        <span className={cn('rounded px-1 font-sans', r.origen === 'lote' ? 'bg-violet-500/10 text-violet-600' : 'bg-muted')}>{r.origen === 'lote' ? `lote ${r.lote ?? ''}` : 'manual'}</span>
                        {r.dos_fuentes && <span className="rounded bg-amber-500/10 px-1 font-sans text-amber-600">2 fuentes</span>}
                      </div>
                    </td>
                    {esTodas && <td className="px-3 py-2 text-xs">{r.sucursal}</td>}
                    <td className="px-3 py-2 text-right"><div className="text-xs">{r.fecha_vencimiento}</div><div className={cn('text-[11px] font-medium', r.dias_restantes <= 0 ? 'text-rose-600' : r.dias_restantes <= 30 ? 'text-amber-600' : 'text-muted-foreground')}>{r.dias_restantes <= 0 ? 'vencido' : `en ${r.dias_restantes}d`}</div></td>
                    <td className="px-3 py-2 text-right"><Ventana r={r} /></td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{r.stock_gondola}/{r.stock_deposito}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{r.dias_stock_restante != null ? `${r.dias_stock_restante}d` : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium text-rose-600">{money(r.monto)}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5 text-xs"><AccIcon className="size-3.5 text-primary" /><span className="font-medium">{r.accion_label}</span></div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">{r.motivo}</div>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {r.accion !== 'vigilar' && <Button size="sm" variant={r.accion === 'devolver' ? 'default' : 'default'} className="h-6 px-2 text-[11px]" disabled={busy === r.id} onClick={() => ejecutar(r, r.accion)}>{r.accion_label}</Button>}
                        {r.accion !== 'devolver' && r.ventana_estado !== 'cerrada' && r.ventana_estado !== 'desconocida' && <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => setDevolver(r)}>Devolver</Button>}
                        {r.accion !== 'liquidar' && <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => ejecutar(r, 'liquidar')}>Liquidar</Button>}
                        <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px] text-emerald-600" disabled={busy === r.id} onClick={() => ejecutar(r, 'baja')} title="Dar de baja"><Check className="size-3" /></Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {cargar && <CargarSheet sucursales={sucursales} proveedores={proveedores} sucursalActiva={sucursalActiva} onClose={() => setCargar(false)} />}
      {devolver && <DevolverSheet row={devolver} proveedores={proveedores} onClose={() => setDevolver(null)} />}
    </div>
  )
}

function Ventana({ r }: { r: VencimientoRow }) {
  if (r.ventana_estado === 'desconocida') return <span className="text-[11px] text-muted-foreground">—</span>
  if (r.ventana_estado === 'cerrada') return <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">cerrada</span>
  const cls = r.ventana_estado === 'por_cerrar' ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
  return (
    <div>
      <div className="text-xs">{r.ventana_cierra}</div>
      <div className={cn('text-[11px] font-medium', cls)}>{r.dias_ventana_restantes! <= 0 ? 'hoy' : `en ${r.dias_ventana_restantes}d`}</div>
    </div>
  )
}

function DevolverSheet({ row, proveedores, onClose }: { row: VencimientoRow; proveedores: Prov[]; onClose: () => void }) {
  const router = useRouter()
  const [cantidad, setCantidad] = useState(String(row.cantidad))
  const [prov, setProv] = useState(row.proveedor_id ?? '')
  const [busy, setBusy] = useState(false)

  async function confirmar() {
    const c = Number(cantidad)
    if (!(c > 0)) { toast.error('Poné la cantidad a devolver.'); return }
    setBusy(true)
    try {
      const r = await fetch('/api/operaciones/vencimientos', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          accion: 'devolver', origen: row.origen, vencimiento_id: row.origen === 'manual' ? row.id : null, lote_id: row.lote_id,
          producto_id: row.producto_id, sku: row.sku, producto: row.producto, sucursal_id: row.sucursal_id,
          proveedor_id: prov || null, cantidad: c, costo: row.costo, fecha_limite: row.ventana_cierra,
        }),
      })
      const j = await r.json(); if (!r.ok) throw new Error(j?.error)
      toast.success('Devolución creada + tarea de preparación asignada. El stock se descuenta al completarla.')
      onClose(); router.refresh()
    } catch (e: any) { toast.error(e?.message ?? 'Error') } finally { setBusy(false) }
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader><SheetTitle>Devolver a droguería</SheetTitle></SheetHeader>
        <div className="flex flex-1 flex-col gap-4 pt-4">
          <div className="rounded-md border p-3 text-sm">
            <div className="font-medium">{row.producto}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">{row.sucursal} · vence {row.fecha_vencimiento}{row.ventana_cierra ? ` · devolver antes del ${row.ventana_cierra}` : ''}</div>
            <div className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">Recuperás {money(Number(cantidad || row.cantidad) * row.costo)} al costo.</div>
          </div>
          <div className="space-y-1.5"><Label className="text-xs">Cantidad a devolver</Label><Input type="number" value={cantidad} onChange={(e) => setCantidad(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label className="text-xs">Droguería / proveedor</Label>
            <Select value={prov} onValueChange={setProv}>
              <SelectTrigger><SelectValue placeholder="Elegí la droguería" /></SelectTrigger>
              <SelectContent>{proveedores.map((p) => <SelectItem key={p.id} value={p.id}>{p.razon_social}{p.dias_ventana_devolucion != null ? ` · ${p.dias_ventana_devolucion}d ventana` : ''}</SelectItem>)}</SelectContent>
            </Select>
            {!row.proveedor_id && <p className="text-[11px] text-muted-foreground">No estaba fijado el proveedor de este producto — elegilo para registrar la devolución.</p>}
          </div>
          <Button size="lg" disabled={busy} onClick={confirmar}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Undo2 className="size-4" />} Crear devolución + tarea</Button>
          <p className="text-[11px] text-muted-foreground">Se crea una tarea con evidencia foto para el responsable. El stock se descuenta recién cuando la marque como hecha.</p>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function CargarSheet({ sucursales, proveedores, sucursalActiva, onClose }: { sucursales: Suc[]; proveedores: Prov[]; sucursalActiva: string | null; onClose: () => void }) {
  const router = useRouter()
  const [sucursal, setSucursal] = useState(sucursalActiva ?? '')
  const [proveedor, setProveedor] = useState('')
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

  function add(p: any) { setItems((x) => [...x, { producto_id: p.id, sku: p.sku, nombre: p.nombre, fecha: '', cantidad: '1', ubicacion: 'gondola', sucursal_id: sucursal }]); setQ(''); setMatches([]) }
  function upd(i: number, patch: Partial<Carga>) { setItems((x) => x.map((it, j) => j === i ? { ...it, ...patch } : it)) }

  async function submit() {
    const listos = items.filter((i) => i.fecha && Number(i.cantidad) > 0)
    if (!listos.length) { toast.error('Cargá producto, fecha y cantidad.'); return }
    setBusy(true)
    try {
      const r = await fetch('/api/operaciones/vencimientos', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accion: 'cargar', items: listos.map((i) => ({ producto_id: i.producto_id, sku: i.sku, sucursal_id: i.sucursal_id || sucursal, proveedor_id: proveedor || null, fecha_vencimiento: i.fecha, cantidad: Number(i.cantidad), ubicacion: i.ubicacion })) }),
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
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Sucursal</Label><Select value={sucursal} onValueChange={setSucursal}><SelectTrigger><SelectValue placeholder="Sucursal" /></SelectTrigger><SelectContent>{sucursales.map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}</SelectContent></Select></div>
            <div><Label className="text-xs">Droguería (opcional)</Label><Select value={proveedor} onValueChange={setProveedor}><SelectTrigger><SelectValue placeholder="Para la ventana" /></SelectTrigger><SelectContent>{proveedores.map((p) => <SelectItem key={p.id} value={p.id}>{p.razon_social}</SelectItem>)}</SelectContent></Select></div>
          </div>
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
