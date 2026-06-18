'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Wallet, Vault, Check, X, ArrowDownToLine, Lock, Settings2, Play } from 'lucide-react'
import { toast } from 'sonner'

import { formatARS } from '@/lib/utils/format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

export type SucCajaConfig = { id: string; nombre: string; fondo_fijo: number; usa_caja_general: boolean; usa_caja_fuerte: boolean; saldo_general: number }
export type TurnoRow = { id: string; sucursal: string; fecha: string; apertura: number; ventas: number; pagos: number; esperado: number | null; contado: number | null; diferencia: number | null; fondo_dejado: number | null; retiro: number | null; estado: string }
export type MovRow = { id: string; tipo: string; monto: number; estado: string; notas: string | null; fecha: string; sucursal: string }

const TIPO_MOV: Record<string, string> = { entrada_turno: 'Remanente turno', pago_proveedor: 'Pago proveedor', retiro_socios: 'Retiro socios', ajuste: 'Ajuste' }
const TURNO_VARIANT: Record<string, any> = { abierto: 'info', cerrado_pendiente_aprobacion: 'warning', aprobado: 'success' }

async function post(body: any) {
  const r = await fetch('/api/finanzas/caja', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const j = await r.json()
  if (!r.ok) throw new Error(j?.error || 'Error')
  return j
}

export function CajaClient({ rol, sucursales, turnos, movimientos }: { rol: string; sucursales: SucCajaConfig[]; turnos: TurnoRow[]; movimientos: MovRow[] }) {
  const router = useRouter()
  const esSuper = rol === 'super_admin'
  const puedeConfig = rol === 'super_admin' || rol === 'gerente'
  const [abrir, setAbrir] = useState(false)
  const [cerrar, setCerrar] = useState<TurnoRow | null>(null)
  const [retiro, setRetiro] = useState(false)
  const pendientes = movimientos.filter((m) => m.estado === 'pendiente_aprobacion')

  async function resolver(id: string, action: 'aprobar' | 'rechazar') {
    try { await post({ action, movimiento_id: id }); toast.success(action === 'aprobar' ? 'Aprobado.' : 'Rechazado.'); router.refresh() }
    catch (e: any) { toast.error(e?.message ?? 'Error') }
  }

  return (
    <Tabs defaultValue="general" className="space-y-4">
      <TabsList>
        <TabsTrigger value="general">Caja general</TabsTrigger>
        <TabsTrigger value="turnos">Turnos</TabsTrigger>
        {puedeConfig && <TabsTrigger value="config">Configuración</TabsTrigger>}
      </TabsList>

      {/* ===== GENERAL ===== */}
      <TabsContent value="general" className="space-y-5">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {sucursales.map((s) => (
            <div key={s.id} className="rounded-lg border border-border p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Vault className="size-3.5" /> {s.nombre}</div>
              <div className="mt-1 font-mono text-lg font-semibold tabular-nums">{formatARS(s.saldo_general)}</div>
              <div className="text-[10px] text-muted-foreground">fondo fijo {formatARS(s.fondo_fijo)}</div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Aprobaciones pendientes</h2>
          {pendientes.length > 0 && <Badge variant="warning">{pendientes.length}</Badge>}
          {puedeConfig && <Button size="sm" variant="outline" className="ml-auto" onClick={() => setRetiro(true)}><ArrowDownToLine className="size-4" /> Retiro de socios</Button>}
        </div>
        {pendientes.length === 0 ? (
          <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">Sin movimientos pendientes de aprobación.</div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2">Sucursal</th><th className="px-3 py-2">Tipo</th><th className="px-3 py-2">Detalle</th><th className="px-3 py-2 text-right">Monto</th><th className="px-3 py-2" /></tr></thead>
              <tbody>
                {pendientes.map((m) => (
                  <tr key={m.id} className="border-t border-border">
                    <td className="px-3 py-1.5">{m.sucursal}</td>
                    <td className="px-3 py-1.5 text-xs">{TIPO_MOV[m.tipo] ?? m.tipo}</td>
                    <td className="px-3 py-1.5 text-xs text-muted-foreground">{m.notas ?? '—'}</td>
                    <td className={cn('px-3 py-1.5 text-right font-mono tabular-nums', m.monto < 0 && 'text-rose-600 dark:text-rose-400')}>{formatARS(m.monto)}</td>
                    <td className="px-3 py-1.5 text-right">
                      {esSuper ? (
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => resolver(m.id, 'aprobar')}><Check className="size-3.5" /></Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-rose-600" onClick={() => resolver(m.id, 'rechazar')}><X className="size-3.5" /></Button>
                        </div>
                      ) : <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"><Lock className="size-3" /> espera super_admin</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <section>
          <h2 className="mb-2 text-sm font-semibold">Movimientos recientes</h2>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2">Fecha</th><th className="px-3 py-2">Sucursal</th><th className="px-3 py-2">Tipo</th><th className="px-3 py-2 text-right">Monto</th><th className="px-3 py-2">Estado</th></tr></thead>
              <tbody>
                {movimientos.slice(0, 40).map((m) => (
                  <tr key={m.id} className="border-t border-border">
                    <td className="px-3 py-1.5 text-xs">{String(m.fecha).slice(0, 10)}</td>
                    <td className="px-3 py-1.5">{m.sucursal}</td>
                    <td className="px-3 py-1.5 text-xs">{TIPO_MOV[m.tipo] ?? m.tipo}</td>
                    <td className={cn('px-3 py-1.5 text-right font-mono tabular-nums', m.monto < 0 && 'text-rose-600 dark:text-rose-400')}>{formatARS(m.monto)}</td>
                    <td className="px-3 py-1.5"><Badge variant={m.estado === 'aprobado' ? 'success' : m.estado === 'rechazado' ? 'outline' : 'warning'} className="font-normal">{m.estado}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </TabsContent>

      {/* ===== TURNOS ===== */}
      <TabsContent value="turnos" className="space-y-4">
        <div className="flex items-center gap-2">
          <p className="text-sm text-muted-foreground">El cierre usa arqueo ciego: contás el efectivo sin ver el esperado.</p>
          <Button size="sm" className="ml-auto" onClick={() => setAbrir(true)}><Play className="size-4" /> Abrir turno</Button>
        </div>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2">Fecha</th><th className="px-3 py-2">Sucursal</th><th className="px-3 py-2 text-right">Apertura</th><th className="px-3 py-2 text-right">Contado</th><th className="px-3 py-2 text-right">Dif.</th><th className="px-3 py-2 text-right">Retiro</th><th className="px-3 py-2">Estado</th><th className="px-3 py-2" /></tr></thead>
            <tbody>
              {turnos.map((t) => (
                <tr key={t.id} className="border-t border-border">
                  <td className="px-3 py-1.5 text-xs">{t.fecha}</td>
                  <td className="px-3 py-1.5">{t.sucursal}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{formatARS(t.apertura)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{t.contado != null ? formatARS(t.contado) : '—'}</td>
                  <td className={cn('px-3 py-1.5 text-right tabular-nums', (t.diferencia ?? 0) !== 0 && 'text-rose-600 dark:text-rose-400')}>{t.diferencia != null ? formatARS(t.diferencia) : '—'}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{t.retiro != null ? formatARS(t.retiro) : '—'}</td>
                  <td className="px-3 py-1.5"><Badge variant={TURNO_VARIANT[t.estado] ?? 'outline'} className="font-normal">{t.estado.replace(/_/g, ' ')}</Badge></td>
                  <td className="px-3 py-1.5 text-right">{t.estado === 'abierto' && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setCerrar(t)}>Cerrar</Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </TabsContent>

      {/* ===== CONFIG ===== */}
      {puedeConfig && (
        <TabsContent value="config" className="space-y-3">
          {sucursales.map((s) => <ConfigSucursal key={s.id} suc={s} />)}
        </TabsContent>
      )}

      {abrir && <AbrirTurno sucursales={sucursales} onClose={() => setAbrir(false)} />}
      {cerrar && <CerrarTurno turno={cerrar} onClose={() => setCerrar(null)} />}
      {retiro && <RetiroSocios sucursales={sucursales} onClose={() => setRetiro(false)} />}
    </Tabs>
  )
}

function ConfigSucursal({ suc }: { suc: SucCajaConfig }) {
  const router = useRouter()
  const [fondo, setFondo] = useState(String(suc.fondo_fijo))
  const [busy, setBusy] = useState(false)
  async function save() {
    setBusy(true)
    try { await post({ action: 'config', sucursal_id: suc.id, fondo_fijo: Number(fondo) }); toast.success('Fondo fijo actualizado.'); router.refresh() }
    catch (e: any) { toast.error(e?.message ?? 'Error') } finally { setBusy(false) }
  }
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border p-3">
      <Settings2 className="size-4 text-muted-foreground" />
      <div className="flex-1 text-sm font-medium">{suc.nombre}</div>
      <Label className="text-xs text-muted-foreground">Fondo fijo</Label>
      <Input type="number" value={fondo} onChange={(e) => setFondo(e.target.value)} className="h-8 w-32 text-right" />
      <Button size="sm" disabled={busy} onClick={save}>Guardar</Button>
    </div>
  )
}

function AbrirTurno({ sucursales, onClose }: { sucursales: SucCajaConfig[]; onClose: () => void }) {
  const router = useRouter()
  const [sucId, setSucId] = useState('')
  const [busy, setBusy] = useState(false)
  const suc = sucursales.find((s) => s.id === sucId)
  async function submit() {
    if (!sucId) { toast.error('Elegí la sucursal.'); return }
    setBusy(true)
    try { const j = await post({ action: 'abrir_turno', sucursal_id: sucId }); toast.success(`Turno abierto con ${formatARS(j.apertura)} de fondo.`); onClose(); router.refresh() }
    catch (e: any) { toast.error(e?.message ?? 'Error') } finally { setBusy(false) }
  }
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-sm">
        <SheetHeader><SheetTitle>Abrir turno</SheetTitle></SheetHeader>
        <div className="flex flex-col gap-4 pt-4">
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Sucursal</Label>
            <Select value={sucId} onValueChange={setSucId}><SelectTrigger><SelectValue placeholder="Elegí sucursal" /></SelectTrigger>
              <SelectContent>{sucursales.map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}</SelectContent></Select>
          </div>
          {suc && <p className="text-xs text-muted-foreground">La apertura toma el fondo fijo configurado: <b>{formatARS(suc.fondo_fijo)}</b>.</p>}
          <Button size="lg" disabled={busy} onClick={submit}>{busy ? 'Abriendo…' : 'Abrir turno'}</Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function CerrarTurno({ turno, onClose }: { turno: TurnoRow; onClose: () => void }) {
  const router = useRouter()
  const [ventas, setVentas] = useState('')
  const [pagos, setPagos] = useState('')
  const [contado, setContado] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit() {
    if (contado === '') { toast.error('Ingresá el efectivo contado.'); return }
    setBusy(true)
    try {
      const j = await post({ action: 'cerrar_turno', turno_id: turno.id, ventas_efectivo: Number(ventas) || 0, pagos_efectivo: Number(pagos) || 0, contado: Number(contado) })
      const dif = Number(j.diferencia)
      toast.success(`Turno cerrado. ${dif === 0 ? 'Sin diferencia' : dif > 0 ? `Sobrante ${formatARS(dif)}` : `Faltante ${formatARS(Math.abs(dif))}`}. Retiro a general: ${formatARS(j.retiro_a_general)} (pendiente de aprobación).`)
      onClose(); router.refresh()
    } catch (e: any) { toast.error(e?.message ?? 'Error') } finally { setBusy(false) }
  }
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-sm">
        <SheetHeader><SheetTitle>Cerrar turno · arqueo ciego</SheetTitle></SheetHeader>
        <div className="flex flex-col gap-4 pt-4">
          <p className="text-xs text-muted-foreground">{turno.sucursal} · {turno.fecha}. No se muestra el esperado para evitar sesgo.</p>
          <div className="space-y-1.5"><Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Ventas en efectivo del turno</Label><Input type="number" value={ventas} onChange={(e) => setVentas(e.target.value)} placeholder="0" /></div>
          <div className="space-y-1.5"><Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Pagos en efectivo del turno</Label><Input type="number" value={pagos} onChange={(e) => setPagos(e.target.value)} placeholder="0" /></div>
          <div className="space-y-1.5"><Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Efectivo contado (arqueo) *</Label><Input type="number" value={contado} onChange={(e) => setContado(e.target.value)} placeholder="0" autoFocus /></div>
          <p className="text-[11px] text-muted-foreground">El sistema dejará el fondo fijo y enviará el remanente a la caja general (requiere aprobación de super_admin).</p>
          <Button size="lg" disabled={busy} onClick={submit}>{busy ? 'Cerrando…' : 'Cerrar y arquear'}</Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function RetiroSocios({ sucursales, onClose }: { sucursales: SucCajaConfig[]; onClose: () => void }) {
  const router = useRouter()
  const [sucId, setSucId] = useState('')
  const [monto, setMonto] = useState('')
  const [notas, setNotas] = useState('')
  const [busy, setBusy] = useState(false)
  const suc = sucursales.find((s) => s.id === sucId)
  async function submit() {
    if (!sucId || !(Number(monto) > 0)) { toast.error('Sucursal y monto requeridos.'); return }
    setBusy(true)
    try { await post({ action: 'retiro_socios', sucursal_id: sucId, monto: Number(monto), notas }); toast.success('Retiro solicitado — pendiente de aprobación.'); onClose(); router.refresh() }
    catch (e: any) { toast.error(e?.message ?? 'Error') } finally { setBusy(false) }
  }
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-sm">
        <SheetHeader><SheetTitle>Retiro de socios</SheetTitle></SheetHeader>
        <div className="flex flex-col gap-4 pt-4">
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Sucursal (caja general)</Label>
            <Select value={sucId} onValueChange={setSucId}><SelectTrigger><SelectValue placeholder="Elegí sucursal" /></SelectTrigger>
              <SelectContent>{sucursales.map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre} · {formatARS(s.saldo_general)}</SelectItem>)}</SelectContent></Select>
          </div>
          {suc && <p className="text-xs text-muted-foreground">Saldo disponible: <b>{formatARS(suc.saldo_general)}</b></p>}
          <div className="space-y-1.5"><Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Monto</Label><Input type="number" value={monto} onChange={(e) => setMonto(e.target.value)} /></div>
          <div className="space-y-1.5"><Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Notas</Label><Input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Distribución de utilidades…" /></div>
          <p className="text-[11px] text-muted-foreground">El retiro requiere aprobación de super_admin antes de descontar de la caja general.</p>
          <Button size="lg" disabled={busy} onClick={submit}>{busy ? 'Enviando…' : 'Solicitar retiro'}</Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
