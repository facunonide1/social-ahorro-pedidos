'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Crown, Repeat, Cake, Megaphone, Plus, Loader2, Trash2, Wand2, Users } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import type { SegmentoRegla, ClienteNivel } from '@/lib/types/crm'

export type SegmentoAutoView = { clave: string; nombre: string; descripcion: string; icon: string; count: number }
export type SegmentoGuardado = { id: string; nombre: string; descripcion: string | null; tipo: string; n_clientes: number; dinamico: boolean }

const ICONS: Record<string, any> = { AlertTriangle, Crown, Repeat, Cake }

async function post(body: any) {
  const r = await fetch('/api/crm/segmentos', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const j = await r.json(); if (!r.ok) throw new Error(j?.error || 'Error')
  return j
}

export function SegmentosClient({ autos, guardados }: { autos: SegmentoAutoView[]; guardados: SegmentoGuardado[] }) {
  const router = useRouter()
  const [crear, setCrear] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  async function campañaAuto(clave: string) {
    setBusy(clave)
    try {
      const j = await post({ accion: 'guardar_auto', clave })
      router.push(`/admin/clientes/comunicacion?segmento=${j.id}`)
    } catch (e: any) { toast.error(e?.message ?? 'Error') } finally { setBusy(null) }
  }
  async function campañaGuardado(id: string) { router.push(`/admin/clientes/comunicacion?segmento=${id}`) }
  async function eliminar(id: string) {
    if (!confirm('¿Eliminar este segmento?')) return
    try { await post({ accion: 'eliminar', id }); toast.success('Eliminado'); router.refresh() } catch (e: any) { toast.error(e?.message) }
  }

  return (
    <div className="space-y-6">
      {/* Segmentos automáticos de NORA */}
      <section>
        <h2 className="mb-2 text-sm font-semibold">Segmentos de NORA (automáticos)</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {autos.map((s) => {
            const I = ICONS[s.icon] ?? Users
            return (
              <div key={s.clave} className="flex flex-col rounded-lg border border-border bg-card p-4">
                <div className="flex items-start justify-between">
                  <div className="rounded-lg bg-primary/10 p-2 text-primary"><I className="size-5" /></div>
                  <span className="text-2xl font-semibold tabular-nums">{s.count}</span>
                </div>
                <div className="mt-2 font-medium">{s.nombre}</div>
                <div className="mt-0.5 flex-1 text-xs text-muted-foreground">{s.descripcion}</div>
                <Button size="sm" className="mt-3" disabled={s.count === 0 || busy === s.clave} onClick={() => campañaAuto(s.clave)}>
                  {busy === s.clave ? <Loader2 className="size-4 animate-spin" /> : <Megaphone className="size-4" />} Crear campaña
                </Button>
              </div>
            )
          })}
        </div>
      </section>

      {/* Segmentos manuales */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Segmentos a medida</h2>
          <Button size="sm" variant="outline" onClick={() => setCrear(true)}><Plus className="size-4" /> Nuevo segmento</Button>
        </div>
        {guardados.length === 0 ? (
          <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">Sin segmentos manuales. Creá uno con reglas combinables.</div>
        ) : (
          <div className="space-y-2">
            {guardados.map((s) => (
              <div key={s.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                <Users className="size-4 text-muted-foreground" />
                <div className="min-w-0 flex-1"><div className="font-medium">{s.nombre}</div>{s.descripcion && <div className="truncate text-xs text-muted-foreground">{s.descripcion}</div>}</div>
                <Badge variant="secondary">{s.n_clientes} clientes</Badge>
                {s.dinamico && <Badge variant="outline" className="text-[10px]">dinámico</Badge>}
                <Button size="sm" onClick={() => campañaGuardado(s.id)}><Megaphone className="size-4" /> Campaña</Button>
                <Button variant="ghost" size="icon" className="size-7 text-red-500" onClick={() => eliminar(s.id)}><Trash2 className="size-3.5" /></Button>
              </div>
            ))}
          </div>
        )}
      </section>

      {crear && <ConstructorSegmento onClose={() => setCrear(false)} onSaved={() => { setCrear(false); router.refresh() }} />}
    </div>
  )
}

function ConstructorSegmento({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [nombre, setNombre] = useState('')
  const [gastoMin, setGastoMin] = useState('')
  const [frecMax, setFrecMax] = useState('')
  const [ultMin, setUltMin] = useState('')
  const [nivel, setNivel] = useState('')
  const [riesgo, setRiesgo] = useState('')
  const [dinamico, setDinamico] = useState(true)
  const [preview, setPreview] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  function regla(): SegmentoRegla {
    const r: SegmentoRegla = {}
    if (gastoMin) r.gasto_min = Number(gastoMin)
    if (frecMax) r.frecuencia_max_dias = Number(frecMax)
    if (ultMin) r.ultima_compra_dias_min = Number(ultMin)
    if (nivel) r.nivel = nivel as ClienteNivel
    if (riesgo) r.riesgo = riesgo as any
    return r
  }

  async function previsualizar() {
    setBusy(true)
    try { const j = await post({ accion: 'preview', regla: regla() }); setPreview(j.count) } catch (e: any) { toast.error(e?.message) } finally { setBusy(false) }
  }
  async function guardar() {
    if (!nombre.trim()) { toast.error('Poné un nombre'); return }
    setBusy(true)
    try { await post({ accion: 'guardar', nombre, regla: regla(), dinamico }); toast.success('Segmento guardado'); onSaved() }
    catch (e: any) { toast.error(e?.message) } finally { setBusy(false) }
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader><SheetTitle>Nuevo segmento</SheetTitle></SheetHeader>
        <div className="flex flex-col gap-3 pt-4 pb-8">
          <div className="space-y-1.5"><Label className="text-xs">Nombre</Label><Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: VIP de Centro" /></div>
          <div className="rounded-lg border border-border p-3">
            <div className="text-sm font-medium">Reglas (se combinan con Y)</div>
            <div className="mt-2 grid gap-2">
              <div className="space-y-1"><Label className="text-xs">Gastó al menos ($ 12m)</Label><Input type="number" value={gastoMin} onChange={(e) => setGastoMin(e.target.value)} placeholder="Ej: 50000" /></div>
              <div className="space-y-1"><Label className="text-xs">Frecuencia ≤ (días)</Label><Input type="number" value={frecMax} onChange={(e) => setFrecMax(e.target.value)} placeholder="Ej: 35 (crónicos)" /></div>
              <div className="space-y-1"><Label className="text-xs">No compra hace ≥ (días)</Label><Input type="number" value={ultMin} onChange={(e) => setUltMin(e.target.value)} placeholder="Ej: 30 (inactivos)" /></div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1"><Label className="text-xs">Nivel</Label>
                  <Select value={nivel || '__any__'} onValueChange={(v) => setNivel(v === '__any__' ? '' : v)}><SelectTrigger className="h-9"><SelectValue placeholder="Cualquiera" /></SelectTrigger>
                    <SelectContent><SelectItem value="__any__">Cualquiera</SelectItem><SelectItem value="socio">Socio</SelectItem><SelectItem value="plus">Plus</SelectItem><SelectItem value="premium">Premium</SelectItem></SelectContent></Select></div>
                <div className="space-y-1"><Label className="text-xs">Churn</Label>
                  <Select value={riesgo || '__any__'} onValueChange={(v) => setRiesgo(v === '__any__' ? '' : v)}><SelectTrigger className="h-9"><SelectValue placeholder="Cualquiera" /></SelectTrigger>
                    <SelectContent><SelectItem value="__any__">Cualquiera</SelectItem><SelectItem value="bajo">Bajo</SelectItem><SelectItem value="medio">Medio</SelectItem><SelectItem value="alto">Alto</SelectItem></SelectContent></Select></div>
              </div>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={dinamico} onChange={(e) => setDinamico(e.target.checked)} className="size-4 accent-[hsl(var(--primary))]" /> Dinámico (se recalcula solo)</label>
          {preview != null && <div className="rounded-md bg-primary/5 px-3 py-2 text-sm">Caen <b>{preview}</b> clientes con estas reglas.</div>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={busy} onClick={previsualizar}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Users className="size-4" />} Previsualizar</Button>
            <Button disabled={busy} onClick={guardar}><Wand2 className="size-4" /> Guardar</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
