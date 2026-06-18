'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Download, RefreshCw, Repeat } from 'lucide-react'
import { toast } from 'sonner'

import { exportExcel } from '@/lib/utils/export-excel'
import { formatARS } from '@/lib/utils/format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'

export type GastoRow = { id: string; concepto: string; tipo: string; monto: number | null; frecuencia: string; dia_mes: number; activo: boolean; sucursal_id: string | null; proveedor_id: string | null; sucursal: string | null; proveedor: string | null }
export type InstanciaRow = { id: string; periodo: string; monto: number; estado: string; vencimiento: string; concepto: string }
type Suc = { id: string; nombre: string }
type Prov = { id: string; nombre: string }

const TIPOS = [['alquiler', 'Alquiler'], ['servicio', 'Servicio'], ['seguro', 'Seguro'], ['sueldos', 'Sueldos'], ['otro', 'Otro']] as const
const TIPO_LABEL = Object.fromEntries(TIPOS) as Record<string, string>

export function GastosFijosClient({ gastos, instancias, sucursales, proveedores }: { gastos: GastoRow[]; instancias: InstanciaRow[]; sucursales: Suc[]; proveedores: Prov[] }) {
  const router = useRouter()
  const [edit, setEdit] = useState<GastoRow | null>(null)
  const [abierto, setAbierto] = useState(false)
  const [generando, setGenerando] = useState(false)
  const totalMensual = gastos.filter((g) => g.activo).reduce((a, g) => a + (g.monto ?? 0), 0)

  async function generarMes() {
    setGenerando(true)
    try {
      const r = await fetch('/api/cron/gastos-fijos', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error || 'Error')
      toast.success(`${j.generadas} instancia(s) generada(s) para ${j.periodo}.`); router.refresh()
    } catch (e: any) { toast.error(e?.message ?? 'Error') } finally { setGenerando(false) }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-sm text-muted-foreground">{gastos.length} gastos fijos · estimado mensual: <b className="text-foreground">{formatARS(totalMensual)}</b></div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" disabled={generando} onClick={generarMes}><RefreshCw className="size-4" /> Generar mes</Button>
          <Button size="sm" onClick={() => { setEdit(null); setAbierto(true) }}><Plus className="size-4" /> Nuevo gasto fijo</Button>
        </div>
      </div>

      {gastos.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-14 text-center">
          <Repeat className="size-7 text-muted-foreground" /><div className="text-sm text-muted-foreground">Sin gastos fijos. Cargá alquiler, servicios, seguros…</div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2">Concepto</th><th className="px-3 py-2">Tipo</th><th className="px-3 py-2">Sucursal</th><th className="px-3 py-2">Día</th><th className="px-3 py-2 text-right">Monto</th><th className="px-3 py-2">Estado</th><th className="px-3 py-2" /></tr></thead>
            <tbody>
              {gastos.map((g) => (
                <tr key={g.id} className="border-t border-border">
                  <td className="px-3 py-1.5 font-medium">{g.concepto}</td>
                  <td className="px-3 py-1.5 text-xs">{TIPO_LABEL[g.tipo] ?? g.tipo}</td>
                  <td className="px-3 py-1.5 text-xs text-muted-foreground">{g.sucursal ?? 'Todas'}</td>
                  <td className="px-3 py-1.5 text-xs">{g.dia_mes}</td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums">{g.monto != null ? formatARS(g.monto) : '—'}</td>
                  <td className="px-3 py-1.5"><Badge variant={g.activo ? 'success' : 'outline'} className="font-normal">{g.activo ? 'activo' : 'inactivo'}</Badge></td>
                  <td className="px-3 py-1.5 text-right"><Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setEdit(g); setAbierto(true) }}>Editar</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section>
        <div className="mb-2 flex items-center gap-2">
          <h2 className="text-sm font-semibold">Instancias generadas</h2>
          <Button variant="outline" size="sm" className="ml-auto" disabled={!instancias.length} onClick={() => exportExcel('gastos-fijos-instancias', instancias.map((i) => ({ Concepto: i.concepto, Periodo: i.periodo, Vencimiento: i.vencimiento, Monto: i.monto, Estado: i.estado })))}><Download className="size-4" /> Excel</Button>
        </div>
        {instancias.length === 0 ? (
          <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">Sin instancias. Usá "Generar mes".</div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2">Concepto</th><th className="px-3 py-2">Período</th><th className="px-3 py-2">Vence</th><th className="px-3 py-2 text-right">Monto</th><th className="px-3 py-2">Estado</th></tr></thead>
              <tbody>
                {instancias.map((i) => (
                  <tr key={i.id} className="border-t border-border">
                    <td className="px-3 py-1.5 font-medium">{i.concepto}</td>
                    <td className="px-3 py-1.5 font-mono text-xs">{i.periodo}</td>
                    <td className="px-3 py-1.5 text-xs">{i.vencimiento}</td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums">{formatARS(i.monto)}</td>
                    <td className="px-3 py-1.5"><Badge variant={i.estado === 'pagado' ? 'success' : 'warning'} className="font-normal">{i.estado}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {abierto && <FormGasto gasto={edit} sucursales={sucursales} proveedores={proveedores} onClose={() => setAbierto(false)} />}
    </div>
  )
}

function FormGasto({ gasto, sucursales, proveedores, onClose }: { gasto: GastoRow | null; sucursales: Suc[]; proveedores: Prov[]; onClose: () => void }) {
  const router = useRouter()
  const [f, setF] = useState({
    concepto: gasto?.concepto ?? '', tipo: gasto?.tipo ?? 'otro', monto: gasto?.monto != null ? String(gasto.monto) : '',
    dia_mes: String(gasto?.dia_mes ?? 1), sucursal_id: gasto?.sucursal_id ?? '', proveedor_id: gasto?.proveedor_id ?? '', activo: gasto?.activo ?? true,
  })
  const [busy, setBusy] = useState(false)
  function set<K extends keyof typeof f>(k: K, v: (typeof f)[K]) { setF((p) => ({ ...p, [k]: v })) }

  async function submit() {
    if (!f.concepto.trim()) { toast.error('Concepto requerido.'); return }
    setBusy(true)
    try {
      const r = await fetch('/api/finanzas/gastos-fijos', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: gasto?.id, concepto: f.concepto, tipo: f.tipo, monto: f.monto ? Number(f.monto) : null, frecuencia: 'mensual', dia_mes: Number(f.dia_mes), sucursal_id: f.sucursal_id || null, proveedor_id: f.proveedor_id || null, activo: f.activo }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error || 'Error')
      toast.success(gasto ? 'Gasto actualizado.' : 'Gasto fijo creado.'); onClose(); router.refresh()
    } catch (e: any) { toast.error(e?.message ?? 'Error') } finally { setBusy(false) }
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader><SheetTitle>{gasto ? 'Editar gasto fijo' : 'Nuevo gasto fijo'}</SheetTitle></SheetHeader>
        <div className="flex flex-1 flex-col gap-4 pt-4">
          <Field label="Concepto *"><Input value={f.concepto} onChange={(e) => set('concepto', e.target.value)} placeholder="Alquiler sucursal centro" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo">
              <Select value={f.tipo} onValueChange={(v) => set('tipo', v)}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TIPOS.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select>
            </Field>
            <Field label="Día del mes"><Input type="number" min={1} max={28} value={f.dia_mes} onChange={(e) => set('dia_mes', e.target.value)} /></Field>
          </div>
          <Field label="Monto estimado"><Input type="number" value={f.monto} onChange={(e) => set('monto', e.target.value)} /></Field>
          <Field label="Sucursal">
            <Select value={f.sucursal_id || '__none__'} onValueChange={(v) => set('sucursal_id', v === '__none__' ? '' : v)}><SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
              <SelectContent><SelectItem value="__none__">Todas</SelectItem>{sucursales.map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}</SelectContent></Select>
          </Field>
          <Field label="Proveedor (opcional)">
            <Select value={f.proveedor_id || '__none__'} onValueChange={(v) => set('proveedor_id', v === '__none__' ? '' : v)}><SelectTrigger><SelectValue placeholder="Sin proveedor" /></SelectTrigger>
              <SelectContent><SelectItem value="__none__">Sin proveedor</SelectItem>{proveedores.map((p) => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}</SelectContent></Select>
          </Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.activo} onChange={(e) => set('activo', e.target.checked)} className="size-4 accent-[hsl(var(--primary))]" /> Activo</label>
          <Button size="lg" disabled={busy} onClick={submit} className="mt-1">{busy ? 'Guardando…' : 'Guardar'}</Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</Label>{children}</div>
}
