'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Cake, Clock, Repeat, TrendingUp, Plus, Loader2, Trash2, Play, Bell, Mail, MessageCircle } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { AUTOMATIZACION_LABEL, CANAL_LABEL, type Automatizacion, type AutomatizacionTrigger, type Canal } from '@/lib/types/crm'

const TRIGGER_ICON: Record<AutomatizacionTrigger, any> = { cumpleanos: Cake, inactividad_30d: Clock, recompra_cronico: Repeat, nivel_alcanzado: TrendingUp }
const CANAL_ICON: Record<Canal, any> = { push: Bell, email: Mail, whatsapp: MessageCircle }

async function post(body: any) {
  const r = await fetch('/api/crm/automatizaciones', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const j = await r.json(); if (!r.ok) throw new Error(j?.error || 'Error')
  return j
}

export function AutomatizacionesClient({ autos }: { autos: Automatizacion[] }) {
  const router = useRouter()
  const [crear, setCrear] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  async function toggle(a: Automatizacion) {
    setBusy(a.id)
    try { await post({ accion: 'toggle', id: a.id, activa: !a.activa }); router.refresh() } catch (e: any) { toast.error(e?.message) } finally { setBusy(null) }
  }
  async function eliminar(id: string) { if (!confirm('¿Eliminar?')) return; try { await post({ accion: 'eliminar', id }); toast.success('Eliminada'); router.refresh() } catch (e: any) { toast.error(e?.message) } }
  async function correrAhora() {
    setBusy('run')
    try { const j = await post({ accion: 'correr' }); const tot = (j.resultado ?? []).reduce((a: number, r: any) => a + r.disparos, 0); toast.success(`Corrida: ${tot} disparos`); router.refresh() } catch (e: any) { toast.error(e?.message) } finally { setBusy(null) }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <p className="text-sm text-muted-foreground">Se evalúan a diario (cron). Activá o pausá cada una.</p>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" disabled={busy === 'run'} onClick={correrAhora}>{busy === 'run' ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />} Correr ahora</Button>
          <Button size="sm" onClick={() => setCrear(true)}><Plus className="size-4" /> Nueva</Button>
        </div>
      </div>

      {autos.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">Sin automatizaciones. Creá una (cumpleaños, reactivación, recompra).</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {autos.map((a) => {
            const I = TRIGGER_ICON[a.trigger] ?? Clock
            return (
              <div key={a.id} className={cn('rounded-lg border p-4', a.activa ? 'border-border bg-card' : 'border-dashed border-border bg-muted/20 opacity-75')}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg bg-primary/10 p-2 text-primary"><I className="size-5" /></div>
                    <div><div className="font-medium">{a.nombre}</div><div className="text-xs text-muted-foreground">{AUTOMATIZACION_LABEL[a.trigger]}</div></div>
                  </div>
                  <button onClick={() => toggle(a)} disabled={busy === a.id} className={cn('relative h-5 w-9 rounded-full transition-colors', a.activa ? 'bg-primary' : 'bg-muted-foreground/30')}>
                    <span className={cn('absolute top-0.5 size-4 rounded-full bg-white transition-transform', a.activa ? 'left-[18px]' : 'left-0.5')} />
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="flex gap-1">{(a.canales ?? []).map((c) => { const CI = CANAL_ICON[c as Canal] ?? Bell; return <CI key={c} className="size-3.5" /> })}</span>
                  {a.canales?.includes('whatsapp') && <Badge variant="outline" className="text-[9px] text-amber-600">WA encola</Badge>}
                  <span className="ml-auto">{a.n_disparos} disparos</span>
                  <Button variant="ghost" size="icon" className="size-6 text-red-500" onClick={() => eliminar(a.id)}><Trash2 className="size-3" /></Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {crear && <CrearAuto onClose={() => setCrear(false)} onDone={() => { setCrear(false); router.refresh() }} />}
    </div>
  )
}

function CrearAuto({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [nombre, setNombre] = useState('')
  const [trigger, setTrigger] = useState<AutomatizacionTrigger>('cumpleanos')
  const [canales, setCanales] = useState<Canal[]>(['push'])
  const [dias, setDias] = useState('30')
  const [busy, setBusy] = useState(false)

  function toggleCanal(c: Canal) { setCanales((p) => p.includes(c) ? p.filter((x) => x !== c) : [...p, c]) }

  async function guardar() {
    if (!nombre.trim()) { toast.error('Poné un nombre'); return }
    const config: Record<string, unknown> = {}
    if (trigger === 'inactividad_30d') config.dias_inactividad = Number(dias) || 30
    if (trigger === 'recompra_cronico') config.dias_antes_recompra = Number(dias) || 5
    setBusy(true)
    try { await post({ accion: 'guardar', nombre, trigger, canales, config, activa: true }); toast.success('Automatización creada (NORA redactó el mensaje)'); onDone() }
    catch (e: any) { toast.error(e?.message) } finally { setBusy(false) }
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader><SheetTitle>Nueva automatización</SheetTitle></SheetHeader>
        <div className="flex flex-col gap-3 pt-4">
          <div className="space-y-1"><Label className="text-xs">Nombre</Label><Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Saludo de cumpleaños" /></div>
          <div className="space-y-1"><Label className="text-xs">Disparador</Label>
            <Select value={trigger} onValueChange={(v) => setTrigger(v as AutomatizacionTrigger)}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{(Object.keys(AUTOMATIZACION_LABEL) as AutomatizacionTrigger[]).map((t) => <SelectItem key={t} value={t}>{AUTOMATIZACION_LABEL[t]}</SelectItem>)}</SelectContent></Select></div>
          {(trigger === 'inactividad_30d' || trigger === 'recompra_cronico') && (
            <div className="space-y-1"><Label className="text-xs">{trigger === 'inactividad_30d' ? 'Días sin comprar' : 'Días antes de que se acabe'}</Label><Input type="number" value={dias} onChange={(e) => setDias(e.target.value)} /></div>
          )}
          <div className="space-y-1"><Label className="text-xs">Canales</Label>
            <div className="flex gap-2">
              {(['push', 'email', 'whatsapp'] as Canal[]).map((c) => { const I = CANAL_ICON[c]; const on = canales.includes(c); return (
                <button key={c} type="button" onClick={() => toggleCanal(c)} className={cn('inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs', on ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground')}>
                  <I className="size-3.5" /> {CANAL_LABEL[c]}{c === 'whatsapp' && <span className="text-[9px] text-amber-600">·API</span>}
                </button>) })}
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">NORA redacta el mensaje automáticamente según el disparador. Lo podés ajustar después.</p>
          <Button disabled={busy} onClick={guardar}>{busy ? <Loader2 className="size-4 animate-spin" /> : null} Crear automatización</Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
