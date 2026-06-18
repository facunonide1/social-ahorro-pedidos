'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Download, Search, FileText } from 'lucide-react'
import { toast } from 'sonner'

import { exportExcel } from '@/lib/utils/export-excel'
import { formatARS } from '@/lib/utils/format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

export type DocRow = { id: string; tipo: string; numero: string; total: number; emision: string; vencimiento: string; estado: string; sucursal_id: string | null; proveedor: string }
type Prov = { id: string; nombre: string; cuit: string; plazo: number; forma: string | null }
type Suc = { id: string; nombre: string }
const ALL = '__all__'

const TIPO_DOC = [
  ['factura_a', 'Factura A'], ['factura_b', 'Factura B'], ['factura_c', 'Factura C'],
  ['nota_credito', 'Nota de crédito'], ['nota_debito', 'Nota de débito'],
  ['recibo', 'Recibo'], ['remito', 'Remito'], ['gasto', 'Comprobante de gasto'],
] as const
const TIPO_LABEL = Object.fromEntries(TIPO_DOC) as Record<string, string>

const ESTADO_VARIANT: Record<string, any> = {
  pendiente_aprobacion: 'warning', aprobada: 'info', programada_pago: 'info',
  pagada_parcial: 'warning', pagada: 'success', vencida: 'destructive', borrador: 'outline', rechazada: 'outline', anulada: 'outline',
}

export function DocumentosClient({ docs, proveedores, sucursales }: { docs: DocRow[]; proveedores: Prov[]; sucursales: Suc[] }) {
  const [q, setQ] = useState('')
  const [tipo, setTipo] = useState(ALL)
  const [estado, setEstado] = useState(ALL)
  const [nueva, setNueva] = useState(false)
  const hoy = new Date().toISOString().slice(0, 10)

  const rows = useMemo(() => docs.filter((d) => {
    if (tipo !== ALL && d.tipo !== tipo) return false
    if (estado !== ALL && d.estado !== estado) return false
    if (q.trim() && !`${d.proveedor} ${d.numero}`.toLowerCase().includes(q.trim().toLowerCase())) return false
    return true
  }), [docs, q, tipo, estado])

  const pendiente = docs.filter((d) => !['pagada', 'anulada', 'rechazada', 'borrador'].includes(d.estado) && d.tipo !== 'nota_credito').reduce((a, d) => a + d.total, 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por proveedor o número…" className="h-9 pl-8" />
        </div>
        <Select value={tipo} onValueChange={setTipo}><SelectTrigger className="h-9 w-[150px] text-xs"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent><SelectItem value={ALL}>Todos los tipos</SelectItem>{TIPO_DOC.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select>
        <Select value={estado} onValueChange={setEstado}><SelectTrigger className="h-9 w-[150px] text-xs"><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent><SelectItem value={ALL}>Todos los estados</SelectItem>{['pendiente_aprobacion','aprobada','programada_pago','pagada_parcial','pagada','vencida'].map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent></Select>
        <Button variant="outline" size="sm" onClick={() => exportExcel('documentos', rows.map((d) => ({ Tipo: TIPO_LABEL[d.tipo] ?? d.tipo, Proveedor: d.proveedor, Numero: d.numero, Emision: d.emision, Vencimiento: d.vencimiento, Total: d.total, Estado: d.estado })))}><Download className="size-4" /> Excel</Button>
        <Button size="sm" onClick={() => setNueva(true)}><Plus className="size-4" /> Nueva factura</Button>
      </div>

      <div className="text-xs text-muted-foreground">{rows.length} documentos · pendiente de pago: <b className="text-foreground">{formatARS(pendiente)}</b></div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-14 text-center">
          <FileText className="size-7 text-muted-foreground" /><div className="text-sm text-muted-foreground">Sin documentos. Cargá uno o el demo.</div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2">Tipo</th><th className="px-3 py-2">Proveedor</th><th className="px-3 py-2">Número</th><th className="px-3 py-2">Vence</th><th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2">Estado</th></tr></thead>
            <tbody>
              {rows.map((d) => {
                const vencido = d.estado !== 'pagada' && d.vencimiento < hoy
                return (
                  <tr key={d.id} className="border-t border-border">
                    <td className="px-3 py-1.5 text-xs">{TIPO_LABEL[d.tipo] ?? d.tipo}</td>
                    <td className="px-3 py-1.5 font-medium">{d.proveedor}</td>
                    <td className="px-3 py-1.5 font-mono text-xs">{d.numero}</td>
                    <td className={cn('px-3 py-1.5', vencido && 'font-medium text-rose-600 dark:text-rose-400')}>{d.vencimiento}</td>
                    <td className={cn('px-3 py-1.5 text-right font-mono tabular-nums', d.tipo === 'nota_credito' && 'text-emerald-600 dark:text-emerald-400')}>{d.tipo === 'nota_credito' ? '−' : ''}{formatARS(d.total)}</td>
                    <td className="px-3 py-1.5"><Badge variant={ESTADO_VARIANT[d.estado] ?? 'outline'} className="font-normal">{d.estado}</Badge></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {nueva && <NuevaDoc proveedores={proveedores} sucursales={sucursales} onClose={() => setNueva(false)} />}
    </div>
  )
}

function NuevaDoc({ proveedores, sucursales, onClose }: { proveedores: Prov[]; sucursales: Suc[]; onClose: () => void }) {
  const router = useRouter()
  const hoy = new Date().toISOString().slice(0, 10)
  const [busy, setBusy] = useState(false)
  const [f, setF] = useState({ tipo_documento: 'factura_a', proveedor_id: '', numero: '', total: '', fecha_emision: hoy, fecha_vencimiento: '', sucursal_id: '', forma_pago_prevista: '', es_futura: false, observaciones: '' })
  const prov = proveedores.find((p) => p.id === f.proveedor_id)

  function set<K extends keyof typeof f>(k: K, v: (typeof f)[K]) { setF((p) => ({ ...p, [k]: v })) }
  function onProveedor(id: string) {
    const p = proveedores.find((x) => x.id === id)
    const venc = new Date(new Date(f.fecha_emision).getTime() + (p?.plazo ?? 0) * 86_400_000).toISOString().slice(0, 10)
    setF((prev) => ({ ...prev, proveedor_id: id, fecha_vencimiento: venc, forma_pago_prevista: p?.forma ?? prev.forma_pago_prevista }))
  }
  function onEmision(d: string) {
    const venc = prov ? new Date(new Date(d).getTime() + prov.plazo * 86_400_000).toISOString().slice(0, 10) : f.fecha_vencimiento
    setF((p) => ({ ...p, fecha_emision: d, fecha_vencimiento: venc }))
  }

  async function submit(forzar = false) {
    if (!f.proveedor_id || !f.numero.trim() || !Number(f.total)) { toast.error('Proveedor, número y monto son obligatorios.'); return }
    setBusy(true)
    try {
      const r = await fetch('/api/finanzas/documentos', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...f, total: Number(f.total), fecha_vencimiento: f.fecha_vencimiento || f.fecha_emision, sucursal_id: f.sucursal_id || null, forma_pago_prevista: f.forma_pago_prevista || null, forzar }),
      })
      const j = await r.json()
      if (r.status === 409 && j.duplicado) {
        if (confirm('Ya existe un documento con ese proveedor, número y monto. ¿Cargarlo igual?')) return submit(true)
        return
      }
      if (!r.ok) throw new Error(j?.error || 'Error')
      toast.success('Documento cargado.'); onClose(); router.refresh()
    } catch (e: any) { toast.error(e?.message ?? 'Error') } finally { setBusy(false) }
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader><SheetTitle>Nuevo documento</SheetTitle></SheetHeader>
        <div className="flex flex-1 flex-col gap-4 pt-4">
          <Field label="Tipo de documento">
            <Select value={f.tipo_documento} onValueChange={(v) => set('tipo_documento', v)}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TIPO_DOC.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select>
          </Field>
          <Field label="Proveedor *">
            <Select value={f.proveedor_id} onValueChange={onProveedor}><SelectTrigger><SelectValue placeholder="Elegí un proveedor" /></SelectTrigger>
              <SelectContent>{proveedores.map((p) => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}</SelectContent></Select>
            {prov && <p className="mt-1 text-[10px] text-muted-foreground">CUIT {prov.cuit} · {prov.forma ?? 'sin forma de pago'} · {prov.plazo}d</p>}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Número *"><Input value={f.numero} onChange={(e) => set('numero', e.target.value)} placeholder="0001-00001234" /></Field>
            <Field label="Monto total *"><Input type="number" value={f.total} onChange={(e) => set('total', e.target.value)} /></Field>
            <Field label="Emisión"><Input type="date" value={f.fecha_emision} onChange={(e) => onEmision(e.target.value)} /></Field>
            <Field label="Vencimiento"><Input type="date" value={f.fecha_vencimiento} onChange={(e) => set('fecha_vencimiento', e.target.value)} /></Field>
          </div>
          <Field label="Sucursal">
            <Select value={f.sucursal_id || '__none__'} onValueChange={(v) => set('sucursal_id', v === '__none__' ? '' : v)}><SelectTrigger><SelectValue placeholder="Sin asignar" /></SelectTrigger>
              <SelectContent><SelectItem value="__none__">Sin asignar</SelectItem>{sucursales.map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}</SelectContent></Select>
          </Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.es_futura} onChange={(e) => set('es_futura', e.target.checked)} className="size-4 accent-[hsl(var(--primary))]" /> Es futura / programada</label>
          <Field label="Observaciones"><Textarea rows={2} value={f.observaciones} onChange={(e) => set('observaciones', e.target.value)} /></Field>
          {f.tipo_documento === 'nota_credito' && <p className="text-xs text-amber-600 dark:text-amber-400">La nota de crédito resta en la cuenta corriente del proveedor.</p>}
          <Button size="lg" disabled={busy} onClick={() => submit(false)} className="mt-1">{busy ? 'Guardando…' : 'Guardar documento'}</Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</Label>{children}</div>
}
