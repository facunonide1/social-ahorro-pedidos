'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { MapPin, Plus, Loader2, RefreshCw, Trash2, ClipboardCheck, ArrowRight, TrendingDown } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

const DIAS = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
type Zona = { id: string; nombre: string; tipo: string; sucursal_id: string; sucursal: string; responsable: string | null; responsable_id: string | null; dia_control: number | null }
type Ctrl = { id: string; zona: string; sucursal: string; fecha: string; estado: string; n_productos: number; n_diferencias: number; valor: number }
type Rank = { zona: string; sucursal: string; controles: number; diferencias: number; valor: number }
type Suc = { id: string; nombre: string }; type Usr = { id: string; nombre: string }

export function ControlZonasClient({ zonas, controles, ranking, sucursales, usuarios, sucursalActiva }: {
  zonas: Zona[]; controles: Ctrl[]; ranking: Rank[]; sucursales: Suc[]; usuarios: Usr[]; sucursalActiva: string | null
}) {
  const router = useRouter()
  const [editar, setEditar] = useState<Zona | 'nueva' | null>(null)
  const [gen, setGen] = useState(false)

  async function generar() {
    setGen(true)
    try {
      const r = await fetch('/api/operaciones/zonas', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accion: 'generar' }) })
      const j = await r.json(); if (!r.ok) throw new Error(j?.error)
      toast.success(j.generados > 0 ? `${j.generados} control(es) generado(s) con su tarea.` : 'No había zonas con control para generar esta semana.')
      router.refresh()
    } catch (e: any) { toast.error(e?.message ?? 'Error') } finally { setGen(false) }
  }
  async function borrar(id: string) {
    if (!confirm('¿Desactivar esta zona?')) return
    await fetch('/api/operaciones/zonas', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accion: 'borrar_zona', id }) })
    router.refresh()
  }

  const pendientes = controles.filter((c) => c.estado !== 'cerrado')

  return (
    <div className="space-y-4">
      <Tabs defaultValue="controles">
        <TabsList>
          <TabsTrigger value="controles">Controles {pendientes.length > 0 && <Badge variant="secondary" className="ml-1.5">{pendientes.length}</Badge>}</TabsTrigger>
          <TabsTrigger value="zonas">Zonas ({zonas.length})</TabsTrigger>
          <TabsTrigger value="ranking">Ranking de descuadres</TabsTrigger>
        </TabsList>

        <TabsContent value="controles" className="space-y-3 pt-3">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">{pendientes.length} pendientes · {controles.length} en total</div>
            <Button variant="outline" disabled={gen} onClick={generar}>{gen ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Generar controles de hoy</Button>
          </div>
          {controles.length === 0 ? <Empty t="Sin controles todavía. Definí zonas con día de control o generá uno manual." /> : (
            <div className="space-y-2">
              {controles.map((c) => (
                <Link key={c.id} href={`/admin/operaciones/control-zonas/${c.id}`} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 hover:border-primary/40">
                  <ClipboardCheck className={cn('size-4', c.estado === 'cerrado' ? 'text-emerald-600' : 'text-amber-600')} />
                  <div className="min-w-0 flex-1"><div className="text-sm font-medium">{c.zona} · {c.sucursal}</div><div className="text-xs text-muted-foreground">{c.fecha} · {c.n_productos} productos {c.estado === 'cerrado' ? `· ${c.n_diferencias} diferencias` : ''}</div></div>
                  {c.estado === 'cerrado' && c.valor > 0 && <Badge variant="outline" className="border-rose-500/40 text-rose-600">${c.valor.toLocaleString('es-AR')}</Badge>}
                  <Badge variant={c.estado === 'cerrado' ? 'outline' : 'secondary'} className="text-[10px]">{c.estado}</Badge>
                  <ArrowRight className="size-4 text-muted-foreground" />
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="zonas" className="space-y-3 pt-3">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">Zonas físicas por sucursal</div>
            <Button onClick={() => setEditar('nueva')}><Plus className="size-4" /> Nueva zona</Button>
          </div>
          {zonas.length === 0 ? <Empty t="Definí las zonas (góndolas, depósito, sectores) para controlar el stock por partes." /> : (
            <div className="grid gap-2 sm:grid-cols-2">
              {zonas.map((z) => (
                <div key={z.id} className="flex items-center gap-2 rounded-lg border border-border bg-card p-3">
                  <MapPin className="size-4 text-primary" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{z.nombre} <span className="text-[10px] text-muted-foreground">{z.tipo}</span></div>
                    <div className="text-xs text-muted-foreground">{z.sucursal}{z.responsable ? ` · ${z.responsable}` : ' · sin responsable'}{z.dia_control ? ` · controla ${DIAS[z.dia_control]}` : ''}</div>
                  </div>
                  <Button size="icon" variant="ghost" className="size-7" onClick={() => setEditar(z)}><RefreshCw className="size-3.5" /></Button>
                  <Button size="icon" variant="ghost" className="size-7 text-rose-600" onClick={() => borrar(z.id)}><Trash2 className="size-3.5" /></Button>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="ranking" className="space-y-2 pt-3">
          {ranking.length === 0 ? <Empty t="Cuando cierres controles con diferencias, vas a ver acá qué zona descuadra más." /> : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2">Zona</th><th className="px-3 py-2">Sucursal</th><th className="px-3 py-2 text-right">Controles</th><th className="px-3 py-2 text-right">Diferencias</th><th className="px-3 py-2 text-right">$ descuadre</th></tr></thead>
                <tbody>{ranking.map((r, i) => (
                  <tr key={i} className="border-t border-border/60"><td className="px-3 py-1.5 font-medium">{r.zona}</td><td className="px-3 py-1.5 text-xs">{r.sucursal}</td><td className="px-3 py-1.5 text-right">{r.controles}</td><td className="px-3 py-1.5 text-right">{r.diferencias}</td><td className="px-3 py-1.5 text-right font-medium text-rose-600">${Math.round(r.valor).toLocaleString('es-AR')}</td></tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {editar && <ZonaSheet zona={editar === 'nueva' ? null : editar} sucursales={sucursales} usuarios={usuarios} sucursalActiva={sucursalActiva} onClose={() => setEditar(null)} />}
    </div>
  )
}

function ZonaSheet({ zona, sucursales, usuarios, sucursalActiva, onClose }: { zona: Zona | null; sucursales: Suc[]; usuarios: Usr[]; sucursalActiva: string | null; onClose: () => void }) {
  const router = useRouter()
  const [f, setF] = useState({ nombre: zona?.nombre ?? '', tipo: zona?.tipo ?? 'gondola', sucursal_id: zona?.sucursal_id ?? sucursalActiva ?? '', responsable_id: zona?.responsable_id ?? '', dia_control: zona?.dia_control ? String(zona.dia_control) : '' })
  const [busy, setBusy] = useState(false)
  async function submit() {
    if (!f.nombre || !f.sucursal_id) { toast.error('Nombre y sucursal.'); return }
    setBusy(true)
    try {
      const r = await fetch('/api/operaciones/zonas', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accion: 'guardar_zona', id: zona?.id, nombre: f.nombre, tipo: f.tipo, sucursal_id: f.sucursal_id, responsable_id: f.responsable_id || null, dia_control: f.dia_control ? Number(f.dia_control) : null }) })
      const j = await r.json(); if (!r.ok) throw new Error(j?.error)
      toast.success('Zona guardada.'); onClose(); router.refresh()
    } catch (e: any) { toast.error(e?.message ?? 'Error') } finally { setBusy(false) }
  }
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-3 overflow-y-auto sm:max-w-md">
        <SheetHeader><SheetTitle>{zona ? 'Editar zona' : 'Nueva zona'}</SheetTitle></SheetHeader>
        <div><Label className="text-xs">Nombre</Label><Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} placeholder="Ej. Góndola perfumería" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label className="text-xs">Tipo</Label><Select value={f.tipo} onValueChange={(v) => setF({ ...f, tipo: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="gondola">Góndola</SelectItem><SelectItem value="deposito">Depósito</SelectItem><SelectItem value="otro">Otro</SelectItem></SelectContent></Select></div>
          <div><Label className="text-xs">Sucursal</Label><Select value={f.sucursal_id} onValueChange={(v) => setF({ ...f, sucursal_id: v })}><SelectTrigger><SelectValue placeholder="Sucursal" /></SelectTrigger><SelectContent>{sucursales.map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}</SelectContent></Select></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label className="text-xs">Responsable</Label><Select value={f.responsable_id || '__none__'} onValueChange={(v) => setF({ ...f, responsable_id: v === '__none__' ? '' : v })}><SelectTrigger><SelectValue placeholder="Sin asignar" /></SelectTrigger><SelectContent><SelectItem value="__none__">Sin asignar</SelectItem>{usuarios.map((u) => <SelectItem key={u.id} value={u.id}>{u.nombre}</SelectItem>)}</SelectContent></Select></div>
          <div><Label className="text-xs">Día de control</Label><Select value={f.dia_control || '__none__'} onValueChange={(v) => setF({ ...f, dia_control: v === '__none__' ? '' : v })}><SelectTrigger><SelectValue placeholder="Sin auto" /></SelectTrigger><SelectContent><SelectItem value="__none__">Sin auto</SelectItem>{[1, 2, 3, 4, 5, 6, 7].map((d) => <SelectItem key={d} value={String(d)}>{DIAS[d]}</SelectItem>)}</SelectContent></Select></div>
        </div>
        <Button disabled={busy} onClick={submit}>{busy ? <Loader2 className="size-4 animate-spin" /> : null} Guardar zona</Button>
        <p className="text-[11px] text-muted-foreground">Si ponés día de control, cada semana se genera una tarea automática al responsable para contar esta zona.</p>
      </SheetContent>
    </Sheet>
  )
}

function Empty({ t }: { t: string }) { return <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">{t}</div> }
