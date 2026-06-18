'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Download, Banknote, Wallet, Landmark, FileCheck, AlertTriangle } from 'lucide-react'
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

export type PagoRow = { id: string; numero: string | null; fecha: string; total: number; neto: number; retenciones: number; origen: string; estado: string; proveedor: string }
export type SucCaja = { id: string; nombre: string; saldo: number }
export type CuentaSaldo = { id: string; nombre: string; banco: string; saldo: number }
type Prov = { id: string; nombre: string }
type Pendiente = { id: string; tipo: string; numero: string; total: number; aplicado: number; pendiente: number; vencimiento: string; estado: string; es_nota_credito: boolean }

const ORIGENES = [
  { v: 'efectivo_sucursal', l: 'Efectivo (caja general)', icon: Wallet },
  { v: 'cuenta_bancaria', l: 'Cuenta bancaria', icon: Landmark },
  { v: 'cheque', l: 'Cheque', icon: FileCheck },
  { v: 'mercadopago', l: 'Mercado Pago', icon: Banknote },
] as const
const ORIGEN_LABEL: Record<string, string> = { efectivo_sucursal: 'Efectivo', cuenta_bancaria: 'Banco', cheque: 'Cheque', mercadopago: 'Mercado Pago', efectivo: 'Efectivo', transferencia: 'Transferencia', otro: 'Otro' }
const ESTADO_VARIANT: Record<string, any> = { ejecutado: 'success', aprobado: 'info', solicitado: 'warning', conciliado: 'success', anulado: 'outline' }

export function PagosClient({ pagos, proveedores, sucursales, cuentas }: { pagos: PagoRow[]; proveedores: Prov[]; sucursales: SucCaja[]; cuentas: CuentaSaldo[] }) {
  const [nuevo, setNuevo] = useState(false)
  const totalPagado = pagos.reduce((a, p) => a + p.neto, 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-sm text-muted-foreground">{pagos.length} pagos · egresado: <b className="text-foreground">{formatARS(totalPagado)}</b></div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={() => exportExcel('pagos', pagos.map((p) => ({ Orden: p.numero, Fecha: p.fecha, Proveedor: p.proveedor, Origen: ORIGEN_LABEL[p.origen] ?? p.origen, Bruto: p.total, Retenciones: p.retenciones, Neto: p.neto, Estado: p.estado })))}><Download className="size-4" /> Excel</Button>
          <Button size="sm" onClick={() => setNuevo(true)}><Plus className="size-4" /> Registrar pago</Button>
        </div>
      </div>

      {pagos.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-14 text-center">
          <Banknote className="size-7 text-muted-foreground" /><div className="text-sm text-muted-foreground">Sin pagos registrados.</div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2">Orden</th><th className="px-3 py-2">Fecha</th><th className="px-3 py-2">Proveedor</th><th className="px-3 py-2">Origen</th><th className="px-3 py-2 text-right">Retenc.</th><th className="px-3 py-2 text-right">Neto</th><th className="px-3 py-2">Estado</th></tr></thead>
            <tbody>
              {pagos.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="px-3 py-1.5 font-mono text-xs">{p.numero ?? '—'}</td>
                  <td className="px-3 py-1.5 text-xs">{p.fecha}</td>
                  <td className="px-3 py-1.5 font-medium">{p.proveedor}</td>
                  <td className="px-3 py-1.5 text-xs">{ORIGEN_LABEL[p.origen] ?? p.origen}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{p.retenciones ? formatARS(p.retenciones) : '—'}</td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums">{formatARS(p.neto)}</td>
                  <td className="px-3 py-1.5"><Badge variant={ESTADO_VARIANT[p.estado] ?? 'outline'} className="font-normal">{p.estado}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {nuevo && <NuevoPago proveedores={proveedores} sucursales={sucursales} cuentas={cuentas} onClose={() => setNuevo(false)} />}
    </div>
  )
}

function NuevoPago({ proveedores, sucursales, cuentas, onClose }: { proveedores: Prov[]; sucursales: SucCaja[]; cuentas: CuentaSaldo[]; onClose: () => void }) {
  const router = useRouter()
  const hoy = new Date().toISOString().slice(0, 10)
  const [proveedorId, setProveedorId] = useState('')
  const [pend, setPend] = useState<Pendiente[]>([])
  const [sel, setSel] = useState<Record<string, number>>({}) // factura_id → monto
  const [retenciones, setRetenciones] = useState('')
  const [origen, setOrigen] = useState('efectivo_sucursal')
  const [sucId, setSucId] = useState('')
  const [cuentaId, setCuentaId] = useState('')
  const [cheque, setCheque] = useState({ numero: '', banco: '', fecha_cobro_estimada: '' })
  const [obs, setObs] = useState('')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)

  async function onProveedor(id: string) {
    setProveedorId(id); setSel({}); setPend([]); setLoading(true)
    try {
      const r = await fetch(`/api/finanzas/pagos/pendientes?proveedor_id=${id}`)
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error || 'Error')
      setPend(j.items ?? [])
    } catch (e: any) { toast.error(e?.message ?? 'Error') } finally { setLoading(false) }
  }

  function toggle(p: Pendiente) {
    setSel((prev) => {
      const n = { ...prev }
      if (n[p.id] != null) delete n[p.id]
      else n[p.id] = p.pendiente
      return n
    })
  }

  const bruto = pend.reduce((a, p) => a + (sel[p.id] != null ? (p.es_nota_credito ? -sel[p.id] : sel[p.id]) : 0), 0)
  const reten = Math.max(0, Number(retenciones) || 0)
  const egreso = Math.max(0, bruto - reten)

  // impacto en el origen
  const suc = sucursales.find((s) => s.id === sucId)
  const cta = cuentas.find((c) => c.id === cuentaId)
  let disponible: number | null = null
  if (origen === 'efectivo_sucursal') disponible = suc?.saldo ?? 0
  else if (origen === 'cuenta_bancaria') disponible = cta?.saldo ?? 0
  const frenaEfectivo = origen === 'efectivo_sucursal' && sucId && (disponible ?? 0) < egreso
  const restante = disponible != null ? disponible - egreso : null

  async function submit() {
    const aplicaciones = Object.entries(sel).map(([factura_id, monto]) => ({ factura_id, monto }))
    if (!aplicaciones.length) { toast.error('Seleccioná al menos un documento.'); return }
    if (egreso <= 0) { toast.error('El neto a pagar debe ser positivo.'); return }
    if (origen === 'efectivo_sucursal' && !sucId) { toast.error('Elegí la sucursal de efectivo.'); return }
    if (origen === 'cuenta_bancaria' && !cuentaId) { toast.error('Elegí la cuenta bancaria.'); return }
    if (origen === 'cheque' && (!cheque.numero || !cheque.banco)) { toast.error('Completá número y banco del cheque.'); return }
    setBusy(true)
    try {
      const r = await fetch('/api/finanzas/pagos', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ proveedor_id: proveedorId, fecha_pago: hoy, origen_tipo: origen, origen_sucursal_id: sucId || null, origen_cuenta_id: cuentaId || null, retenciones: reten, aplicaciones, cheque: origen === 'cheque' ? cheque : null, observaciones: obs || null }),
      })
      const j = await r.json()
      if (r.status === 422 && j.frena) { toast.error(`Efectivo insuficiente: hay ${formatARS(j.disponible)} y se necesitan ${formatARS(j.requerido)}.`); return }
      if (!r.ok) throw new Error(j?.error || 'Error')
      toast.success(`Pago ${j.numero_orden_pago} ejecutado · ${formatARS(j.monto_egreso)}.`); onClose(); router.refresh()
    } catch (e: any) { toast.error(e?.message ?? 'Error') } finally { setBusy(false) }
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-lg">
        <SheetHeader><SheetTitle>Registrar pago</SheetTitle></SheetHeader>
        <div className="flex flex-1 flex-col gap-4 pt-4">
          <Field label="Proveedor *">
            <Select value={proveedorId} onValueChange={onProveedor}><SelectTrigger><SelectValue placeholder="Elegí un proveedor" /></SelectTrigger>
              <SelectContent>{proveedores.map((p) => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}</SelectContent></Select>
          </Field>

          {proveedorId && (
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Documentos a pagar</Label>
              {loading ? <p className="text-xs text-muted-foreground">Cargando…</p> : pend.length === 0 ? (
                <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">Sin documentos pendientes.</p>
              ) : (
                <div className="divide-y rounded-md border border-border">
                  {pend.map((p) => {
                    const on = sel[p.id] != null
                    return (
                      <div key={p.id} className="flex items-center gap-2 px-2.5 py-2">
                        <input type="checkbox" checked={on} onChange={() => toggle(p)} className="size-4 accent-[hsl(var(--primary))]" />
                        <button type="button" onClick={() => toggle(p)} className="flex-1 text-left">
                          <div className="text-xs font-medium">{p.es_nota_credito ? 'NC ' : ''}{p.numero}</div>
                          <div className="text-[10px] text-muted-foreground">vence {p.vencimiento} · pend. {formatARS(p.pendiente)}</div>
                        </button>
                        {on && <Input type="number" value={sel[p.id]} onChange={(e) => setSel((s) => ({ ...s, [p.id]: Number(e.target.value) }))} className="h-7 w-28 text-right text-xs" />}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {Object.keys(sel).length > 0 && (
            <>
              <Field label="Retenciones (opcional)"><Input type="number" value={retenciones} onChange={(e) => setRetenciones(e.target.value)} placeholder="0" /></Field>

              <Field label="Origen del dinero *">
                <div className="grid grid-cols-2 gap-2">
                  {ORIGENES.map((o) => (
                    <button key={o.v} type="button" onClick={() => setOrigen(o.v)} className={cn('flex items-center gap-2 rounded-md border px-3 py-2 text-xs transition-colors', origen === o.v ? 'border-primary bg-nora-bg font-medium text-primary' : 'border-border hover:bg-accent/60')}>
                      <o.icon className="size-4" /> {o.l}
                    </button>
                  ))}
                </div>
              </Field>

              {origen === 'efectivo_sucursal' && (
                <Field label="Sucursal (caja general) *">
                  <Select value={sucId} onValueChange={setSucId}><SelectTrigger><SelectValue placeholder="Elegí sucursal" /></SelectTrigger>
                    <SelectContent>{sucursales.map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre} · {formatARS(s.saldo)}</SelectItem>)}</SelectContent></Select>
                </Field>
              )}
              {origen === 'cuenta_bancaria' && (
                <Field label="Cuenta bancaria *">
                  <Select value={cuentaId} onValueChange={setCuentaId}><SelectTrigger><SelectValue placeholder="Elegí cuenta" /></SelectTrigger>
                    <SelectContent>{cuentas.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre} ({c.banco}) · {formatARS(c.saldo)}</SelectItem>)}</SelectContent></Select>
                </Field>
              )}
              {origen === 'cheque' && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Nº cheque *"><Input value={cheque.numero} onChange={(e) => setCheque((c) => ({ ...c, numero: e.target.value }))} /></Field>
                  <Field label="Banco *"><Input value={cheque.banco} onChange={(e) => setCheque((c) => ({ ...c, banco: e.target.value }))} /></Field>
                  <Field label="Cobro estimado"><Input type="date" value={cheque.fecha_cobro_estimada} onChange={(e) => setCheque((c) => ({ ...c, fecha_cobro_estimada: e.target.value }))} /></Field>
                </div>
              )}

              {/* Impacto */}
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Bruto</span><span className="tabular-nums">{formatARS(bruto)}</span></div>
                {reten > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Retenciones</span><span className="tabular-nums">− {formatARS(reten)}</span></div>}
                <div className="mt-1 flex justify-between border-t border-border pt-1 font-semibold"><span>Sale del origen</span><span className="tabular-nums">{formatARS(egreso)}</span></div>
                {disponible != null && (
                  <div className={cn('mt-1 flex justify-between text-xs', frenaEfectivo ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground')}>
                    <span>Disponible {formatARS(disponible)} → queda</span><span className="tabular-nums">{formatARS(restante ?? 0)}</span>
                  </div>
                )}
                {frenaEfectivo && <div className="mt-2 flex items-center gap-1.5 rounded bg-rose-500/10 px-2 py-1.5 text-xs text-rose-600 dark:text-rose-400"><AlertTriangle className="size-3.5" /> Efectivo insuficiente — el pago se frena.</div>}
              </div>

              <Field label="Observaciones"><Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} /></Field>
              <Button size="lg" disabled={busy || egreso <= 0 || frenaEfectivo} onClick={submit} className="mt-1">{busy ? 'Ejecutando…' : `Ejecutar pago · ${formatARS(egreso)}`}</Button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</Label>{children}</div>
}
