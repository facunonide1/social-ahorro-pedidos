'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, Truck, PackageCheck, Loader2, Check, X, AlertTriangle, FileText } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { subirFoto, ESTADO_UI } from '../transferencias-client'

type Paso = { fecha: string | null; foto: string | null }
type Item = { id: string; producto: string; sku: string | null; ubicacion: string; enviada: number; recibida: number | null }

export function TransferenciaDetalle({ id, estado, diferencia, notas, origen, destino, pasos, items }: {
  id: string; estado: string; diferencia: boolean; notas: string | null; origen: string; destino: string
  pasos: { creacion: Paso; salida: Paso; recepcion: Paso }; items: Item[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [foto, setFoto] = useState<File | null>(null)
  const [recibidas, setRecibidas] = useState<Record<string, string>>(() => Object.fromEntries(items.map((i) => [i.id, String(i.enviada)])))
  const fileRef = useRef<HTMLInputElement>(null)
  const ui = ESTADO_UI[estado] ?? { label: estado, cls: 'border-border' }

  async function accion(tipo: 'salida' | 'recepcion' | 'cancelar') {
    setBusy(true)
    try {
      let path: string | null = null
      if (tipo !== 'cancelar') {
        if (!foto) { toast.error('Sacá/adjuntá la foto de este paso.'); setBusy(false); return }
        path = await subirFoto('transferencias-fotos', foto, `${id}/${tipo}`)
      }
      const body: any = { accion: tipo, id, foto: path }
      if (tipo === 'recepcion') body.recibidas = Object.fromEntries(Object.entries(recibidas).map(([k, v]) => [k, Number(v)]))
      const r = await fetch('/api/operaciones/transferencias', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const j = await r.json(); if (!r.ok) throw new Error(j?.error)
      toast.success(tipo === 'salida' ? 'Salida confirmada, stock descontado de origen.' : tipo === 'recepcion' ? (j.diferencia ? 'Recepción con diferencia registrada.' : 'Recepción confirmada, stock sumado a destino.') : 'Cancelada.')
      router.refresh()
    } catch (e: any) { toast.error(e?.message ?? 'Error') } finally { setBusy(false); setFoto(null) }
  }

  const PasoCard = ({ titulo, paso, activo, hecho }: { titulo: string; paso: Paso; activo: boolean; hecho: boolean }) => (
    <div className={cn('flex-1 rounded-lg border p-3', hecho ? 'border-emerald-500/30 bg-emerald-500/5' : activo ? 'border-primary/40 bg-primary/5' : 'border-border bg-card')}>
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">{titulo}</div>
        {hecho && <Check className="size-4 text-emerald-600" />}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{paso.fecha ? new Date(paso.fecha).toLocaleString('es-AR') : (activo ? 'pendiente' : '—')}</div>
      {paso.foto ? (
        <a href={paso.foto} target="_blank" rel="noreferrer" className="mt-2 block"><img src={paso.foto} alt={titulo} className="h-28 w-full rounded-md object-cover" /></a>
      ) : <div className="mt-2 flex h-28 items-center justify-center rounded-md border border-dashed text-[11px] text-muted-foreground">sin foto</div>}
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn('rounded-full border px-2.5 py-0.5 text-sm font-medium', ui.cls)}>{ui.label}</span>
        {diferencia && <Badge variant="outline" className="border-rose-500/40 text-rose-600"><AlertTriangle className="mr-1 size-3" /> diferencia entre enviado y recibido</Badge>}
      </div>

      {/* 3 fotos / pasos */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <PasoCard titulo="1 · Se crea" paso={pasos.creacion} activo={false} hecho={!!pasos.creacion.fecha} />
        <PasoCard titulo="2 · Sale (origen)" paso={pasos.salida} activo={estado === 'pendiente_salida'} hecho={!!pasos.salida.fecha} />
        <PasoCard titulo="3 · Se recibe (destino)" paso={pasos.recepcion} activo={estado === 'en_transito'} hecho={!!pasos.recepcion.fecha} />
      </div>

      {/* items */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr>
            <th className="px-3 py-2">Producto</th><th className="px-3 py-2">Ubicación</th><th className="px-3 py-2 text-right">Enviado</th><th className="px-3 py-2 text-right">Recibido</th>
          </tr></thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className="border-t border-border/60">
                <td className="px-3 py-1.5">{i.producto} <span className="font-mono text-[10px] text-muted-foreground">{i.sku}</span></td>
                <td className="px-3 py-1.5 text-xs">{i.ubicacion}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{i.enviada}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {estado === 'en_transito'
                    ? <Input type="number" value={recibidas[i.id] ?? ''} onChange={(e) => setRecibidas((p) => ({ ...p, [i.id]: e.target.value }))} className="ml-auto h-7 w-20" />
                    : (i.recibida == null ? '—' : <span className={i.recibida !== i.enviada ? 'font-medium text-rose-600' : ''}>{i.recibida}</span>)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {notas && <div className="flex items-start gap-2 text-xs text-muted-foreground"><FileText className="mt-0.5 size-3.5" /> {notas}</div>}

      {/* acción del paso actual */}
      {(estado === 'pendiente_salida' || estado === 'en_transito') && (
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-sm font-medium">{estado === 'pendiente_salida' ? 'Confirmar SALIDA desde ' + origen : 'Confirmar RECEPCIÓN en ' + destino}</div>
          <p className="text-xs text-muted-foreground">{estado === 'pendiente_salida' ? 'Saca foto de la salida. Se descuenta el stock de origen.' : 'Verificá las cantidades recibidas y sacá foto del ingreso. Se suma el stock a destino.'}</p>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => setFoto(e.target.files?.[0] ?? null)} />
          <div className="mt-2 flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => fileRef.current?.click()}><Camera className="size-4" /> {foto ? foto.name : 'Foto del paso'}</Button>
            <Button disabled={busy} onClick={() => accion(estado === 'pendiente_salida' ? 'salida' : 'recepcion')}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : estado === 'pendiente_salida' ? <Truck className="size-4" /> : <PackageCheck className="size-4" />}
              {estado === 'pendiente_salida' ? 'Confirmar salida' : 'Confirmar recepción'}
            </Button>
            {estado === 'pendiente_salida' && <Button variant="ghost" className="text-rose-600" disabled={busy} onClick={() => accion('cancelar')}><X className="size-4" /> Cancelar</Button>}
          </div>
        </div>
      )}
    </div>
  )
}
