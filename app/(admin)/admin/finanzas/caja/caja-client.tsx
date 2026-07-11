'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Wallet, Vault, Check, X, ArrowDownToLine, Lock, Settings2, Play, Receipt } from 'lucide-react'
import { toast } from 'sonner'

import { formatARS } from '@/lib/utils/format'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

export type SucCajaConfig = { id: string; nombre: string; fondo_fijo: number; usa_caja_general: boolean; usa_caja_fuerte: boolean; saldo_general: number }
export type TurnoRow = { id: string; sucursal_id: string; sucursal: string; fecha: string; apertura: number; ventas: number; pagos: number; esperado: number | null; contado: number | null; diferencia: number | null; fondo_dejado: number | null; retiro: number | null; estado: string }
export type MovRow = { id: string; tipo: string; monto: number; estado: string; notas: string | null; fecha: string; sucursal: string }

const TIPO_MOV: Record<string, string> = { entrada_turno: 'Remanente turno', pago_proveedor: 'Pago proveedor', retiro_socios: 'Retiro socios', ajuste: 'Ajuste' }
const TURNO_VARIANT: Record<string, any> = { abierto: 'info', cerrado_pendiente_aprobacion: 'warning', aprobado: 'success' }

async function post(body: any) {
  const r = await fetch('/api/finanzas/caja', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const j = await r.json()
  if (!r.ok) throw new Error(j?.error || 'Error')
  return j
}

export type Desglose = { efectivo: number; mercadopago: number; tarjetas: number }

export function CajaClient({ rol, sucursales, turnos, movimientos, desglose }: { rol: string; sucursales: SucCajaConfig[]; turnos: TurnoRow[]; movimientos: MovRow[]; desglose?: Desglose }) {
  const router = useRouter()
  const esSuper = rol === 'super_admin'
  const puedeConfig = rol === 'super_admin' || rol === 'gerente'
  const totalDisponible = sucursales.reduce((a, s) => a + s.saldo_general, 0)
  const [abrir, setAbrir] = useState(false)
  const [cerrar, setCerrar] = useState<TurnoRow | null>(null)
  const [retiro, setRetiro] = useState(false)
  const [gastoCC, setGastoCC] = useState(false)
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
        {/* Consolidado disponible para pagos */}
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Wallet className="size-3.5" /> Efectivo consolidado disponible para pagos</div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums">{formatARS(totalDisponible)}</div>
          {desglose && (
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span>Declarado 60d · Efectivo {formatARS(desglose.efectivo)}</span>
              <span>Mercado Pago {formatARS(desglose.mercadopago)}</span>
              <span>Tarjetas {formatARS(desglose.tarjetas)}</span>
            </div>
          )}
        </div>

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
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => setGastoCC(true)}><Receipt className="size-4" /> Gasto caja chica</Button>
          {puedeConfig && <Button size="sm" variant="outline" onClick={() => setRetiro(true)}><ArrowDownToLine className="size-4" /> Retiro de socios</Button>}
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
          <p className="text-sm text-muted-foreground">Abrís el turno y al cerrar cargás el arqueo de SIFACO (efectivo, MP, tarjetas) con la captura. Debe cuadrar en $0.</p>
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
      {cerrar && <CerrarArqueo turno={cerrar} onClose={() => setCerrar(null)} />}
      {retiro && <RetiroSocios sucursales={sucursales} onClose={() => setRetiro(false)} />}
      {gastoCC && <GastoCajaChica sucursales={sucursales} onClose={() => setGastoCC(false)} />}
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

/** Cierre en 2 pasos: (1) conteo a ciegas sellado, (2) contraste con SIFACO. */
function CerrarArqueo({ turno, onClose }: { turno: TurnoRow; onClose: () => void }) {
  const router = useRouter()
  const [fase, setFase] = useState<'conteo' | 'contraste'>('conteo')
  const [arqueoId, setArqueoId] = useState<string | null>(null)
  const [resultado, setResultado] = useState<{ diferencia: number; estado: string; carga_posterior: boolean } | null>(null)
  // paso 1
  const [inicio, setInicio] = useState(String(turno.apertura ?? 0))
  const [efectivo, setEfectivo] = useState('')
  const [mp, setMp] = useState('')
  const [tarjetas, setTarjetas] = useState('')
  const [archivo, setArchivo] = useState<File | null>(null)
  // paso 2
  const [sistema, setSistema] = useState('')
  const [hora, setHora] = useState('')
  const [obs, setObs] = useState('')
  const [subiendo, setSubiendo] = useState(false)
  const [busy, setBusy] = useState(false)

  const declarado = (Number(efectivo) || 0) + (Number(mp) || 0) + (Number(tarjetas) || 0)

  async function confirmarConteo() {
    if (efectivo === '' && mp === '' && tarjetas === '') { toast.error('Cargá al menos un total.'); return }
    if (!archivo) { toast.error('Subí la captura del arqueo de SIFACO.'); return }
    setBusy(true)
    try {
      setSubiendo(true)
      const sb = createClient()
      const ext = archivo.name.split('.').pop() || 'jpg'
      const path = `${turno.sucursal_id}/${turno.id}-${Date.now()}.${ext}`
      const { error: upErr } = await sb.storage.from('arqueos-caja').upload(path, archivo, { upsert: true })
      setSubiendo(false)
      if (upErr) throw new Error('No se pudo subir la captura: ' + upErr.message)
      const j = await post({
        action: 'confirmar_conteo', turno_id: turno.id, captura_url: path,
        inicio_caja: Number(inicio) || 0, total_efectivo: Number(efectivo) || 0,
        total_mercadopago: Number(mp) || 0, total_tarjetas: Number(tarjetas) || 0,
      })
      setArqueoId(j.arqueo_id); setFase('contraste')
      toast.success('Conteo confirmado y sellado. Ahora contrastá con SIFACO.')
    } catch (e: any) { toast.error(e?.message ?? 'Error') } finally { setBusy(false); setSubiendo(false) }
  }

  async function contrastar() {
    if (!arqueoId) return
    setBusy(true)
    try {
      const j = await post({ action: 'contrastar', arqueo_id: arqueoId, total_sistema: Number(sistema) || 0, hora_cierre_sifaco: hora || null, observacion: obs || null })
      setResultado({ diferencia: j.diferencia, estado: j.estado, carga_posterior: j.carga_posterior })
      toast.success(j.diferencia === 0 ? 'Cuadra ✓' : `Diferencia ${formatARS(j.diferencia)}`)
    } catch (e: any) { toast.error(e?.message ?? 'Error') } finally { setBusy(false) }
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-sm">
        <SheetHeader><SheetTitle>Cerrar caja · {fase === 'conteo' ? 'paso 1: conteo' : 'paso 2: contraste'}</SheetTitle></SheetHeader>

        {/* ===== PASO 1 · CONTEO A CIEGAS ===== */}
        {fase === 'conteo' && (
          <div className="flex flex-col gap-3 pt-4 pb-8">
            <p className="text-xs text-muted-foreground">{turno.sucursal} · {turno.fecha}. Contá y cargá tus totales. <b>El total de SIFACO y la diferencia van en el paso siguiente.</b></p>
            <div className="space-y-1.5"><Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Inicio de caja</Label><Input inputMode="decimal" value={inicio} onChange={(e) => setInicio(e.target.value)} /></div>
            <div className="space-y-1.5"><Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Total efectivo</Label><Input inputMode="decimal" value={efectivo} onChange={(e) => setEfectivo(e.target.value)} placeholder="0" autoFocus /></div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5"><Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Mercado Pago</Label><Input inputMode="decimal" value={mp} onChange={(e) => setMp(e.target.value)} placeholder="0" /></div>
              <div className="space-y-1.5"><Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Tarjetas</Label><Input inputMode="decimal" value={tarjetas} onChange={(e) => setTarjetas(e.target.value)} placeholder="0" /></div>
            </div>
            <div className="rounded-lg border border-border p-3 text-sm"><div className="flex items-center justify-between"><span className="text-muted-foreground">Total contado</span><span className="font-mono font-semibold tabular-nums">{formatARS(declarado)}</span></div></div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Captura del arqueo SIFACO *</Label>
              <input type="file" accept="image/*" capture="environment" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} className="block w-full text-xs file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-xs" />
              {archivo && <p className="text-[11px] text-emerald-600">{archivo.name}</p>}
            </div>
            <p className="text-[11px] text-muted-foreground">Al confirmar, tu conteo queda <b>sellado e inmutable</b>. No vas a poder cambiarlo.</p>
            <Button size="lg" disabled={busy} onClick={confirmarConteo}>{busy ? (subiendo ? 'Subiendo captura…' : 'Sellando…') : 'Confirmar conteo'}</Button>
          </div>
        )}

        {/* ===== PASO 2 · CONTRASTE ===== */}
        {fase === 'contraste' && !resultado && (
          <div className="flex flex-col gap-3 pt-4 pb-8">
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-2.5 text-xs text-emerald-700 dark:text-emerald-400">Conteo sellado: <b>{formatARS(declarado)}</b>. Ahora sí, cargá lo que dice SIFACO.</div>
            <div className="space-y-1.5"><Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Total según SIFACO</Label><Input inputMode="decimal" value={sistema} onChange={(e) => setSistema(e.target.value)} placeholder="0 = sin control" autoFocus /></div>
            <div className="space-y-1.5"><Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Hora de cierre de SIFACO</Label><Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} /></div>
            <div className="space-y-1.5"><Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Observación (opcional)</Label><Input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Diferencia justificada, etc." /></div>
            <p className="text-[11px] text-muted-foreground">La diferencia se calcula y se muestra al guardar. El efectivo (menos el fondo fijo) suma al consolidado.</p>
            <Button size="lg" disabled={busy} onClick={contrastar}>{busy ? 'Cerrando…' : 'Contrastar y cerrar'}</Button>
          </div>
        )}

        {/* ===== RESULTADO ===== */}
        {resultado && (
          <div className="flex flex-col gap-3 pt-4 pb-8">
            <div className={cn('rounded-lg p-4 text-center', resultado.diferencia === 0 ? 'bg-emerald-500/10 text-emerald-600' : 'bg-rose-500/10 text-rose-600')}>
              <div className="text-xs uppercase tracking-wider">{resultado.diferencia === 0 ? 'Cuadra' : 'Diferencia'}</div>
              <div className="mt-1 font-mono text-2xl font-bold tabular-nums">{resultado.diferencia === 0 ? '$0 ✓' : formatARS(resultado.diferencia)}</div>
            </div>
            {resultado.carga_posterior && <div className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">⚠ El conteo se confirmó después de la hora de cierre de SIFACO — queda marcado para revisión.</div>}
            <Button size="lg" onClick={() => { onClose(); router.refresh() }}>Listo</Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

const CAJA_CHICA_CATS = [['libreria', 'Librería'], ['limpieza', 'Limpieza'], ['mantenimiento', 'Mantenimiento'], ['viaticos', 'Viáticos'], ['otros', 'Otros']] as const

/** Gasto de caja chica (OS-4b · D): mobile-first, 4 campos + foto obligatoria. */
function GastoCajaChica({ sucursales, onClose }: { sucursales: SucCajaConfig[]; onClose: () => void }) {
  const router = useRouter()
  const [sucId, setSucId] = useState(sucursales.length === 1 ? sucursales[0].id : '')
  const [categoria, setCategoria] = useState('otros')
  const [monto, setMonto] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [archivo, setArchivo] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!sucId || !(Number(monto) > 0)) { toast.error('Sucursal y monto requeridos.'); return }
    if (!archivo) { toast.error('Sacá la foto del comprobante.'); return }
    setBusy(true)
    try {
      const sb = createClient()
      const ext = archivo.name.split('.').pop() || 'jpg'
      const path = `caja-chica/${sucId}/${Date.now()}.${ext}`
      const { error: upErr } = await sb.storage.from('arqueos-caja').upload(path, archivo, { upsert: true })
      if (upErr) throw new Error('No se pudo subir la foto: ' + upErr.message)
      await post({ action: 'gasto_caja_chica', sucursal_id: sucId, categoria, monto: Number(monto), descripcion, comprobante_url: path })
      toast.success('Gasto de caja chica registrado.'); onClose(); router.refresh()
    } catch (e: any) { toast.error(e?.message ?? 'Error') } finally { setBusy(false) }
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-sm">
        <SheetHeader><SheetTitle>Gasto de caja chica</SheetTitle></SheetHeader>
        <div className="flex flex-col gap-4 pt-4">
          <div className="space-y-1.5"><Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Sucursal</Label>
            <Select value={sucId} onValueChange={setSucId}><SelectTrigger><SelectValue placeholder="Elegí sucursal" /></SelectTrigger>
              <SelectContent>{sucursales.map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre} · {formatARS(s.saldo_general)}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Categoría</Label>
            <Select value={categoria} onValueChange={setCategoria}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CAJA_CHICA_CATS.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Monto</Label><Input inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="0" autoFocus /></div>
          <div className="space-y-1.5"><Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Descripción</Label><Input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Ej. resma A4" /></div>
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Foto del comprobante *</Label>
            <input type="file" accept="image/*" capture="environment" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} className="block w-full text-xs file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-xs" />
            {archivo && <p className="text-[11px] text-emerald-600">{archivo.name}</p>}
          </div>
          <Button size="lg" disabled={busy} onClick={submit}>{busy ? 'Guardando…' : 'Registrar gasto'}</Button>
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
