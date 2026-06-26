'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Search, Trash2, Loader2, ArrowRight, Camera, Truck, PackageCheck, AlertTriangle, Clock } from 'lucide-react'
import { toast } from 'sonner'

import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

export type TransferRow = {
  id: string; estado: string; origen: string; destino: string; nItems: number
  fecha_solicitud: string; fecha_envio: string | null; fecha_recepcion: string | null
  diferencia_detectada: boolean; horas_transito: number | null
}
type Suc = { id: string; nombre: string }
type Linea = { producto_id: string; nombre: string; sku: string | null; cantidad: string; ubicacion: 'gondola' | 'deposito' }

export const ESTADO_UI: Record<string, { label: string; cls: string }> = {
  pendiente_salida: { label: 'Pendiente de salida', cls: 'border-amber-500/40 text-amber-600 bg-amber-500/5' },
  en_transito: { label: 'En tránsito', cls: 'border-blue-500/40 text-blue-600 bg-blue-500/5' },
  completada: { label: 'Completada', cls: 'border-emerald-500/40 text-emerald-600 bg-emerald-500/5' },
  cancelada: { label: 'Cancelada', cls: 'border-border text-muted-foreground' },
  // legacy
  solicitada: { label: 'Pendiente de salida', cls: 'border-amber-500/40 text-amber-600 bg-amber-500/5' },
  recibida: { label: 'Completada', cls: 'border-emerald-500/40 text-emerald-600 bg-emerald-500/5' },
}

export async function subirFoto(bucket: string, file: File, prefix: string): Promise<string> {
  const sb = createClient()
  const ext = file.name.split('.').pop() || 'jpg'
  const path = `${prefix}-${Date.now()}.${ext}`
  const { error } = await sb.storage.from(bucket).upload(path, file, { upsert: true })
  if (error) throw new Error('No se pudo subir la foto: ' + error.message)
  return path
}

export function TransferenciasClient({ rows, sucursales, sucursalActiva, sinRecibir }: {
  rows: TransferRow[]; sucursales: Suc[]; sucursalActiva: string | null; sinRecibir: number
}) {
  const [crear, setCrear] = useState(false)
  return (
    <div className="space-y-4">
      {sinRecibir > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm text-amber-700">
          <AlertTriangle className="size-4 shrink-0" /> <b>{sinRecibir}</b> transferencia(s) en tránsito sin recibir hace más de 48hs. Revisá que hayan llegado.
        </div>
      )}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">{rows.length} transferencias</div>
        <Button onClick={() => setCrear(true)}><Plus className="size-4" /> Nueva transferencia</Button>
      </div>

      <div className="space-y-2">
        {rows.length === 0 && <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">Todavía no hay transferencias.</div>}
        {rows.map((t) => {
          const ui = ESTADO_UI[t.estado] ?? { label: t.estado, cls: 'border-border' }
          return (
            <Link key={t.id} href={`/admin/operaciones/transferencias/${t.id}`} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 hover:border-primary/40">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm font-medium"><span>{t.origen}</span><ArrowRight className="size-3.5 text-muted-foreground" /><span>{t.destino}</span></div>
                <div className="mt-0.5 text-xs text-muted-foreground">{t.nItems} producto(s) · creada {new Date(t.fecha_solicitud).toLocaleDateString('es-AR')}</div>
              </div>
              {t.diferencia_detectada && <Badge variant="outline" className="border-rose-500/40 text-[10px] text-rose-600">con diferencia</Badge>}
              {t.estado === 'en_transito' && t.horas_transito != null && t.horas_transito > 48 && <Clock className="size-4 text-amber-600" />}
              <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium', ui.cls)}>{ui.label}</span>
            </Link>
          )
        })}
      </div>

      {crear && <NuevaTransferencia sucursales={sucursales} sucursalActiva={sucursalActiva} onClose={() => setCrear(false)} />}
    </div>
  )
}

function NuevaTransferencia({ sucursales, sucursalActiva, onClose }: { sucursales: Suc[]; sucursalActiva: string | null; onClose: () => void }) {
  const router = useRouter()
  const [origen, setOrigen] = useState(sucursalActiva ?? '')
  const [destino, setDestino] = useState('')
  const [lineas, setLineas] = useState<Linea[]>([])
  const [q, setQ] = useState(''); const [matches, setMatches] = useState<any[]>([])
  const [foto, setFoto] = useState<File | null>(null)
  const [notas, setNotas] = useState('')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const deb = useRef<any>(null)

  useEffect(() => {
    const t = q.trim()
    if (deb.current) clearTimeout(deb.current)
    if (t.length < 2) { setMatches([]); return }
    deb.current = setTimeout(async () => {
      try { const r = await fetch(`/api/ofertas/buscar-producto?q=${encodeURIComponent(t)}`); const j = await r.json(); setMatches(Array.isArray(j) ? j.filter((p: any) => !lineas.some((l) => l.producto_id === p.id)) : []) } catch { setMatches([]) }
    }, 250)
  }, [q, lineas])

  async function submit() {
    if (!origen || !destino || origen === destino) { toast.error('Elegí origen y destino distintos.'); return }
    if (!lineas.length) { toast.error('Agregá al menos un producto.'); return }
    setBusy(true)
    try {
      let path: string | null = null
      if (foto) path = await subirFoto('transferencias-fotos', foto, `${origen}/creacion`)
      const r = await fetch('/api/operaciones/transferencias', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accion: 'crear', origen, destino, foto: path, notas: notas || null, items: lineas.map((l) => ({ producto_id: l.producto_id, cantidad: Number(l.cantidad), ubicacion: l.ubicacion })) }),
      })
      const j = await r.json(); if (!r.ok) throw new Error(j?.error)
      toast.success('Transferencia creada (pendiente de salida).'); onClose(); router.push(`/admin/operaciones/transferencias/${j.id}`)
    } catch (e: any) { toast.error(e?.message ?? 'Error') } finally { setBusy(false) }
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-lg">
        <SheetHeader><SheetTitle>Nueva transferencia</SheetTitle></SheetHeader>
        <div className="flex flex-1 flex-col gap-4 pt-4">
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Origen</Label><Select value={origen} onValueChange={setOrigen}><SelectTrigger><SelectValue placeholder="Sucursal" /></SelectTrigger><SelectContent>{sucursales.map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}</SelectContent></Select></div>
            <div><Label className="text-xs">Destino</Label><Select value={destino} onValueChange={setDestino}><SelectTrigger><SelectValue placeholder="Sucursal" /></SelectTrigger><SelectContent>{sucursales.filter((s) => s.id !== origen).map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}</SelectContent></Select></div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Productos</Label>
            {lineas.map((l, i) => (
              <div key={l.producto_id} className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-sm">
                <span className="min-w-0 flex-1 truncate">{l.nombre} <span className="font-mono text-[10px] text-muted-foreground">{l.sku}</span></span>
                <Input type="number" value={l.cantidad} onChange={(e) => setLineas((p) => p.map((x, j) => j === i ? { ...x, cantidad: e.target.value } : x))} className="h-7 w-16" placeholder="cant" />
                <Select value={l.ubicacion} onValueChange={(v) => setLineas((p) => p.map((x, j) => j === i ? { ...x, ubicacion: v as any } : x))}><SelectTrigger className="h-7 w-24 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="deposito">depósito</SelectItem><SelectItem value="gondola">góndola</SelectItem></SelectContent></Select>
                <Button size="icon" variant="ghost" className="size-7 text-rose-600" onClick={() => setLineas((p) => p.filter((_, j) => j !== i))}><Trash2 className="size-3.5" /></Button>
              </div>
            ))}
            <div className="relative"><Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto por SKU/nombre/EAN…" className="pl-8" /></div>
            {matches.length > 0 && <div className="rounded-md border border-border">{matches.map((m) => <button key={m.id} type="button" onClick={() => { setLineas((p) => [...p, { producto_id: m.id, nombre: m.nombre, sku: m.sku, cantidad: '1', ubicacion: 'deposito' }]); setQ('') }} className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-accent"><span className="truncate">{m.nombre}</span><span className="font-mono text-[10px] text-muted-foreground">{m.sku}</span></button>)}</div>}
          </div>

          <div>
            <Label className="text-xs">Foto de la transferencia (SIFACO)</Label>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => setFoto(e.target.files?.[0] ?? null)} />
            <Button type="button" variant="outline" className="mt-1 w-full" onClick={() => fileRef.current?.click()}><Camera className="size-4" /> {foto ? foto.name : 'Adjuntar foto'}</Button>
          </div>

          <div><Label className="text-xs">Notas (opcional)</Label><Input value={notas} onChange={(e) => setNotas(e.target.value)} /></div>

          <Button size="lg" disabled={busy} onClick={submit} className="mt-1">{busy ? <Loader2 className="size-4 animate-spin" /> : <Truck className="size-4" />} Crear transferencia</Button>
          <p className="text-[11px] text-muted-foreground">El stock NO se mueve ahora. Se descuenta de origen al confirmar la salida, y se suma a destino al confirmar la recepción.</p>
        </div>
      </SheetContent>
    </Sheet>
  )
}
