'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Plus, Megaphone, Download, Sparkles, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'

import { exportExcel, exportCsv } from '@/lib/utils/export-excel'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

export type EventoOferta = { id: string; nombre: string; tipo: string; estado: string; fecha_inicio: string; fecha_fin: string | null; productos?: string[]; sucursales?: string[] }
export type CampaniaRow = { id: string; nombre: string; objetivo: string | null; estado: string; fecha_inicio: string | null; fecha_fin: string | null }

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

export function CalendarioOfertasClient({ eventos, campanias, nPropuestas, hoy }: { eventos: EventoOferta[]; campanias: CampaniaRow[]; nPropuestas: number; hoy: string }) {
  const [y0, m0] = hoy.split('-').map(Number)
  const [ym, setYm] = useState({ y: y0, m: m0 - 1 })
  const [nuevaCamp, setNuevaCamp] = useState(false)
  const router = useRouter()

  // un evento "ocupa" un día si el día cae dentro de [inicio, fin]
  const porDia = useMemo(() => {
    const map: Record<string, EventoOferta[]> = {}
    const y = ym.y, m = ym.m
    const dias = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
    for (let d = 1; d <= dias; d++) {
      const fecha = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      map[fecha] = eventos.filter((e) => e.fecha_inicio <= fecha && (e.fecha_fin ?? e.fecha_inicio) >= fecha)
    }
    return map
  }, [eventos, ym])

  // Conflicto (O-10): día donde ≥2 ofertas comparten producto Y sucursal.
  function hayConflicto(evs: EventoOferta[]): boolean {
    for (let i = 0; i < evs.length; i++) for (let j = i + 1; j < evs.length; j++) {
      const a = evs[i], b = evs[j]
      const prodComun = (a.productos ?? []).some((p) => (b.productos ?? []).includes(p))
      if (!prodComun) continue
      const sa = a.sucursales ?? [], sb = b.sucursales ?? []
      const sucComun = sa.length === 0 || sb.length === 0 || sa.some((s) => sb.includes(s))
      if (sucComun) return true
    }
    return false
  }
  // Hueco: día sin ninguna oferta activa/programada. Fin de semana sin oferta → NORA.
  const finDeSemanaSinOferta = useMemo(() => {
    let n = 0
    for (const [fecha, evs] of Object.entries(porDia)) {
      if (fecha < hoy) continue
      const dow = new Date(`${fecha}T12:00:00Z`).getUTCDay() // 5=vie,6=sáb
      if ((dow === 5 || dow === 6) && evs.filter((e) => ['activa', 'aprobada'].includes(e.estado)).length === 0) n++
    }
    return n
  }, [porDia, hoy])

  async function exportConsolidado() {
    const fecha = prompt('Export SIFACO — ¿qué arranca en la fecha (aaaa-mm-dd)?', hoy)
    if (!fecha) return
    try {
      const r = await fetch('/api/ofertas', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accion: 'export_consolidado', fecha }) })
      const j = await r.json(); if (!r.ok) throw new Error(j?.error)
      if (!j.filas?.length) { toast.error(`No hay ofertas que arranquen el ${fecha}.`); return }
      const filas = j.filas.map((f: any) => ({ SKU: f.sku, EAN: f.ean, Producto: f.producto, Precio: f.precio, Desde: f.fecha_inicio, Hasta: f.fecha_fin, Oferta: f.oferta }))
      exportExcel(j.nombre, filas); exportCsv(j.nombre, filas)
      toast.success(`Export consolidado del ${fecha} (${filas.length} filas).`)
    } catch (e: any) { toast.error(e?.message ?? 'Error') }
  }

  const primeroSemana = (() => { const d = new Date(Date.UTC(ym.y, ym.m, 1)).getUTCDay(); return d === 0 ? 6 : d - 1 })()
  const diasMes = new Date(Date.UTC(ym.y, ym.m + 1, 0)).getUTCDate()
  const celdas: (string | null)[] = [...Array(primeroSemana).fill(null), ...Array.from({ length: diasMes }, (_, i) => `${ym.y}-${String(ym.m + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`)]

  function nav(delta: number) { setYm((p) => { const n = p.m + delta; return { y: p.y + Math.floor(n / 12), m: ((n % 12) + 12) % 12 } }) }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon" className="size-8" onClick={() => nav(-1)}><ChevronLeft className="size-4" /></Button>
        <div className="min-w-[150px] text-center text-sm font-semibold">{MESES[ym.m]} {ym.y}</div>
        <Button variant="outline" size="icon" className="size-8" onClick={() => nav(1)}><ChevronRight className="size-4" /></Button>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={exportConsolidado}><Download className="size-4" /> Export SIFACO (día)</Button>
          <Button size="sm" onClick={() => setNuevaCamp(true)}><Plus className="size-4" /> Nueva campaña</Button>
        </div>
      </div>

      {finDeSemanaSinOferta > 0 && (
        <Link href="/admin/ofertas/propuestas" className="flex items-center gap-2 rounded-lg border border-primary/30 bg-nora-bg px-3 py-2 text-sm hover:border-primary/60">
          <Sparkles className="size-4 shrink-0 text-primary" />
          <span>{finDeSemanaSinOferta} día(s) de fin de semana sin ofertas este mes.{nPropuestas > 0 ? ` Hay ${nPropuestas} propuesta(s) de NORA listas.` : ''} Revisalas →</span>
        </Link>
      )}

      <div className="grid grid-cols-7 gap-1">
        {DIAS.map((d) => <div key={d} className="pb-1 text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{d}</div>)}
        {celdas.map((fecha, i) => {
          if (!fecha) return <div key={i} className="min-h-[64px] rounded-md" />
          const dia = Number(fecha.slice(-2)); const evs = porDia[fecha] ?? []
          const activos = evs.filter((e) => ['activa', 'aprobada'].includes(e.estado))
          const conflicto = hayConflicto(evs)
          const hueco = fecha >= hoy && activos.length === 0
          return (
            <div key={fecha} className={cn('min-h-[64px] rounded-md border border-border p-1', fecha === hoy && 'ring-1 ring-primary', conflicto && 'border-rose-500/60 bg-rose-500/5', hueco && !conflicto && 'border-dashed bg-muted/30')}>
              <span className="flex items-center justify-between text-[10px] font-medium text-muted-foreground">{dia}{conflicto && <AlertTriangle className="size-3 text-rose-500" />}</span>
              <div className="mt-0.5 space-y-0.5">
                {evs.slice(0, 3).map((e) => <Link key={e.id} href={`/admin/ofertas/${e.id}`} className="block truncate rounded bg-primary/10 px-1 text-[9px] text-primary hover:bg-primary/20">{e.nombre}</Link>)}
                {evs.length > 3 && <span className="text-[9px] text-muted-foreground">+{evs.length - 3}</span>}
                {hueco && evs.length === 0 && <span className="text-[9px] text-muted-foreground/60">sin ofertas</span>}
              </div>
            </div>
          )
        })}
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Campañas</h2>
        {campanias.length === 0 ? (
          <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">Sin campañas. Creá una para agrupar ofertas (ej. Vuelta al cole).</div>
        ) : (
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            {campanias.map((c) => (
              <div key={c.id} className="rounded-lg border border-border bg-card p-3">
                <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-1.5 font-medium"><Megaphone className="size-3.5 text-primary" /> {c.nombre}</span><Badge variant={c.estado === 'activa' ? 'success' : 'outline'} className="font-normal">{c.estado}</Badge></div>
                {c.objetivo && <div className="mt-1 text-xs text-muted-foreground">{c.objetivo}</div>}
                {c.fecha_inicio && <div className="mt-1 text-[11px] text-muted-foreground">{c.fecha_inicio} → {c.fecha_fin ?? '?'}</div>}
              </div>
            ))}
          </div>
        )}
      </section>

      {nuevaCamp && <NuevaCampania onClose={() => setNuevaCamp(false)} />}
    </div>
  )
}

function NuevaCampania({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const [f, setF] = useState({ nombre: '', objetivo: '', fecha_inicio: '', fecha_fin: '' })
  const [busy, setBusy] = useState(false)
  async function submit() {
    if (!f.nombre.trim()) { toast.error('Nombre requerido.'); return }
    setBusy(true)
    try {
      const r = await fetch('/api/ofertas', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accion: 'crear_campania', ...f, fecha_inicio: f.fecha_inicio || null, fecha_fin: f.fecha_fin || null }) })
      const j = await r.json(); if (!r.ok) throw new Error(j?.error)
      toast.success('Campaña creada.'); onClose(); router.refresh()
    } catch (e: any) { toast.error(e?.message ?? 'Error') } finally { setBusy(false) }
  }
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader><SheetTitle>Nueva campaña</SheetTitle></SheetHeader>
        <div className="flex flex-col gap-4 pt-4">
          <div className="space-y-1.5"><Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Nombre</Label><Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} placeholder="Vuelta al cole" /></div>
          <div className="space-y-1.5"><Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Objetivo</Label><Input value={f.objetivo} onChange={(e) => setF({ ...f, objetivo: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Desde</Label><Input type="date" value={f.fecha_inicio} onChange={(e) => setF({ ...f, fecha_inicio: e.target.value })} /></div>
            <div className="space-y-1.5"><Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Hasta</Label><Input type="date" value={f.fecha_fin} onChange={(e) => setF({ ...f, fecha_fin: e.target.value })} /></div>
          </div>
          <Button size="lg" disabled={busy} onClick={submit}>{busy ? 'Creando…' : 'Crear campaña'}</Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
