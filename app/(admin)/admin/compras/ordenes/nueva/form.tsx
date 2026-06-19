'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Search, Download, ArrowRightLeft } from 'lucide-react'
import { toast } from 'sonner'

import { exportExcel } from '@/lib/utils/export-excel'
import { formatARS } from '@/lib/utils/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RUBROS } from '@/components/compras/rubro-filter'
import { cn } from '@/lib/utils'

export type ProvLite = { id: string; nombre: string; rubros: string[]; plazo: number | null; forma: string | null }
export type SucLite = { id: string; nombre: string; codigo: string | null }
export type ProdLite = { id: string; sku: string | null; nombre: string; costo: number }
export type ItemInicial = { producto_id: string; nombre: string; sku: string | null; costo: number; distribucion: Record<string, number>; avisoIds: string[] }

type Item = { key: string; producto_id: string | null; nombre: string; sku: string | null; costo: string; dist: Record<string, string>; avisoIds: string[] }

let kc = 0
const nk = () => `k${kc++}`

export function NuevaOrdenForm({ proveedores, sucursales, productos, iniciales }: { proveedores: ProvLite[]; sucursales: SucLite[]; productos: ProdLite[]; iniciales: ItemInicial[] }) {
  const router = useRouter()
  const [rubro, setRubro] = useState('farmacia')
  const [provId, setProvId] = useState('')
  const [sucCompradora, setSucCompradora] = useState('')
  const [origen, setOrigen] = useState(iniciales.length ? 'aviso_faltante' : 'manual')
  const [condicion, setCondicion] = useState('')
  const [notas, setNotas] = useState('')
  const [busy, setBusy] = useState(false)
  const [items, setItems] = useState<Item[]>(
    iniciales.map((i) => ({ key: nk(), producto_id: i.producto_id, nombre: i.nombre, sku: i.sku, costo: String(i.costo || ''), dist: Object.fromEntries(Object.entries(i.distribucion).map(([k, v]) => [k, String(v)])), avisoIds: i.avisoIds })),
  )
  const [q, setQ] = useState('')

  const prov = proveedores.find((p) => p.id === provId)
  const provsRubro = proveedores.filter((p) => rubro === 'todos' || (p.rubros ?? []).includes(rubro) || !p.rubros?.length)

  const matches = useMemo(() => {
    const t = q.trim().toLowerCase(); if (!t) return []
    const usados = new Set(items.map((i) => i.producto_id))
    return productos.filter((p) => !usados.has(p.id) && `${p.nombre} ${p.sku ?? ''}`.toLowerCase().includes(t)).slice(0, 8)
  }, [q, productos, items])

  function addProducto(p: ProdLite) {
    setItems((prev) => [...prev, { key: nk(), producto_id: p.id, nombre: p.nombre, sku: p.sku, costo: String(p.costo || ''), dist: {}, avisoIds: [] }])
    setQ('')
  }
  function rm(key: string) { setItems((p) => p.filter((i) => i.key !== key)) }
  function setDist(key: string, suc: string, val: string) { setItems((p) => p.map((i) => i.key === key ? { ...i, dist: { ...i.dist, [suc]: val } } : i)) }
  function setCosto(key: string, val: string) { setItems((p) => p.map((i) => i.key === key ? { ...i, costo: val } : i)) }

  const totalItem = (i: Item) => sucursales.reduce((a, s) => a + (Number(i.dist[s.id]) || 0), 0)
  const totalGeneral = items.reduce((a, i) => a + totalItem(i) * (Number(i.costo) || 0), 0)
  // transferencias = sucursales destino (≠ compradora) con cantidad > 0
  const transfs = useMemo(() => {
    if (!sucCompradora) return 0
    const set = new Set<string>()
    for (const i of items) for (const s of sucursales) if (s.id !== sucCompradora && (Number(i.dist[s.id]) || 0) > 0) set.add(s.id)
    return set.size
  }, [items, sucCompradora, sucursales])

  function payload(estado: string) {
    return {
      proveedor_id: provId, rubro, sucursal_compradora_id: sucCompradora, origen, condicion_pago: condicion || null, notas: notas || null, estado,
      items: items.map((i) => ({
        producto_id: i.producto_id, descripcion: i.nombre, costo_unitario: Number(i.costo) || 0,
        distribucion: Object.fromEntries(Object.entries(i.dist).map(([k, v]) => [k, Number(v) || 0]).filter(([, v]) => (v as number) > 0)),
        origen_aviso_id: i.avisoIds[0] ?? null,
      })),
    }
  }

  async function guardar(estado: string) {
    if (!provId) { toast.error('Elegí el proveedor.'); return }
    if (!sucCompradora) { toast.error('Elegí la sucursal compradora.'); return }
    if (!items.length || items.every((i) => totalItem(i) === 0)) { toast.error('Agregá ítems con cantidad.'); return }
    setBusy(true)
    try {
      const r = await fetch('/api/compras/ordenes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload(estado)) })
      const j = await r.json(); if (!r.ok) throw new Error(j?.error)
      toast.success(`Orden ${j.codigo} creada.`); router.push('/admin/compras/ordenes')
    } catch (e: any) { toast.error(e?.message ?? 'Error') } finally { setBusy(false) }
  }

  function exportar() {
    exportExcel('orden-para-enviar', items.map((i) => ({ SKU: i.sku ?? '', Producto: i.nombre, Cantidad: totalItem(i), 'Costo unit.': Number(i.costo) || 0, ...Object.fromEntries(sucursales.map((s) => [s.codigo || s.nombre, Number(i.dist[s.id]) || 0])) })))
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <section className="grid gap-3 rounded-lg border border-border p-4 md:grid-cols-2 lg:grid-cols-4">
        <Field label="Rubro"><Select value={rubro} onValueChange={setRubro}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{RUBROS.filter((r) => r.v !== 'todos').map((r) => <SelectItem key={r.v} value={r.v}>{r.l}</SelectItem>)}</SelectContent></Select></Field>
        <Field label="Proveedor / droguería *"><Select value={provId} onValueChange={(v) => { setProvId(v); const p = proveedores.find((x) => x.id === v); if (p) setCondicion(p.plazo ? `${p.plazo} días` : (p.forma ?? '')) }}><SelectTrigger><SelectValue placeholder="Elegí" /></SelectTrigger><SelectContent>{provsRubro.map((p) => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}</SelectContent></Select></Field>
        <Field label="Compra a nombre de *"><Select value={sucCompradora} onValueChange={setSucCompradora}><SelectTrigger><SelectValue placeholder="Sucursal que factura/recibe" /></SelectTrigger><SelectContent>{sucursales.map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}</SelectContent></Select></Field>
        <Field label="Origen"><Select value={origen} onValueChange={setOrigen}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{[['manual','Manual'],['aviso_faltante','Aviso de faltante'],['sugerencia_nora','Sugerencia NORA'],['oportunista','Oportunista'],['sifaco','SIFACO']].map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></Field>
      </section>

      {/* Buscar producto */}
      <div className="space-y-1.5">
        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Agregar producto</Label>
        <div className="relative"><Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o SKU…" className="pl-8" /></div>
        {matches.length > 0 && <div className="rounded-md border border-border">{matches.map((m) => <button key={m.id} type="button" onClick={() => addProducto(m)} className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-accent"><span>{m.nombre}</span><span className="font-mono text-[10px] text-muted-foreground">{m.sku}</span></button>)}</div>}
      </div>

      {/* Tabla de distribución */}
      {items.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2">Producto</th><th className="px-2 py-2 text-right">Costo</th>{sucursales.map((s) => <th key={s.id} className="px-2 py-2 text-center">{s.codigo || s.nombre}</th>)}<th className="px-2 py-2 text-right">Total</th><th className="px-2 py-2 text-right">Subtotal</th><th /></tr></thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.key} className="border-t border-border">
                  <td className="px-3 py-1.5"><div className="font-medium">{i.nombre}</div><div className="font-mono text-[10px] text-muted-foreground">{i.sku}</div></td>
                  <td className="px-2 py-1.5"><Input type="number" value={i.costo} onChange={(e) => setCosto(i.key, e.target.value)} className="h-7 w-20 text-right text-xs" /></td>
                  {sucursales.map((s) => <td key={s.id} className="px-1 py-1.5"><Input type="number" value={i.dist[s.id] ?? ''} onChange={(e) => setDist(i.key, s.id, e.target.value)} className={cn('h-7 w-14 text-center text-xs', s.id === sucCompradora && 'border-primary/50')} /></td>)}
                  <td className="px-2 py-1.5 text-right font-medium tabular-nums">{totalItem(i)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{formatARS(totalItem(i) * (Number(i.costo) || 0))}</td>
                  <td className="px-1 py-1.5"><Button size="sm" variant="ghost" className="h-7 px-2 text-rose-600" onClick={() => rm(i.key)}><Trash2 className="size-3.5" /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sucCompradora && transfs > 0 && (
        <div className="flex items-center gap-2 rounded-md bg-sky-500/10 px-3 py-2 text-xs text-sky-700 dark:text-sky-300">
          <ArrowRightLeft className="size-4" /> Al recibir en <b>{sucursales.find((s) => s.id === sucCompradora)?.nombre}</b> se generarán <b>{transfs}</b> transferencias automáticas a las otras sucursales según la distribución.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <div className="text-sm">Total estimado: <b className="font-mono tabular-nums">{formatARS(totalGeneral)}</b></div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" disabled={!items.length} onClick={exportar}><Download className="size-4" /> Exportar para enviar</Button>
          <Button variant="outline" disabled={busy} onClick={() => guardar('borrador')}>Guardar borrador</Button>
          <Button disabled={busy} onClick={() => guardar('enviada')}>{busy ? 'Generando…' : 'Generar orden'}</Button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</Label>{children}</div>
}
