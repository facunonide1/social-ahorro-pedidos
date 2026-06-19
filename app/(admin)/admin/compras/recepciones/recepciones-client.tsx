'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Download, PackageCheck, ArrowRightLeft } from 'lucide-react'
import { toast } from 'sonner'

import { exportExcel } from '@/lib/utils/export-excel'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

type OrdItem = { producto_id: string; nombre: string; sku: string | null; cantidad: number; costo: number }
export type OrdenRecibible = { id: string; codigo: string | null; estado: string; proveedor: string; sucursal: string; items: OrdItem[] }
export type RecepRow = { id: string; remito: string | null; fecha: string; estado: string; orden: string; sucursal: string }

const EST_VARIANT: Record<string, any> = { completa: 'success', parcial: 'warning', con_diferencias: 'warning', rechazada: 'destructive' }

export function RecepcionesClient({ ordenes, recepciones }: { ordenes: OrdenRecibible[]; recepciones: RecepRow[] }) {
  const [recibir, setRecibir] = useState<OrdenRecibible | null>(null)

  return (
    <div className="space-y-5">
      <section>
        <h2 className="mb-2 text-sm font-semibold">Órdenes por recibir ({ordenes.length})</h2>
        {ordenes.length === 0 ? (
          <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">No hay órdenes pendientes de recepción.</div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2">Código</th><th className="px-3 py-2">Proveedor</th><th className="px-3 py-2">Recibe en</th><th className="px-3 py-2 text-right">Ítems</th><th className="px-3 py-2">Estado</th><th /></tr></thead>
              <tbody>
                {ordenes.map((o) => (
                  <tr key={o.id} className="border-t border-border">
                    <td className="px-3 py-1.5 font-mono text-xs">{o.codigo}</td>
                    <td className="px-3 py-1.5 font-medium">{o.proveedor}</td>
                    <td className="px-3 py-1.5 text-xs text-muted-foreground">{o.sucursal}</td>
                    <td className="px-3 py-1.5 text-right">{o.items.length}</td>
                    <td className="px-3 py-1.5"><Badge variant="info" className="font-normal">{o.estado.replace(/_/g, ' ')}</Badge></td>
                    <td className="px-3 py-1.5 text-right"><Button size="sm" className="h-7 text-xs" onClick={() => setRecibir(o)}>Recibir</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-center gap-2">
          <h2 className="text-sm font-semibold">Recepciones recientes</h2>
          <Button variant="outline" size="sm" className="ml-auto" disabled={!recepciones.length} onClick={() => exportExcel('recepciones', recepciones.map((r) => ({ Orden: r.orden, Remito: r.remito, Fecha: r.fecha, Sucursal: r.sucursal, Estado: r.estado })))}><Download className="size-4" /> Excel</Button>
        </div>
        {recepciones.length === 0 ? (
          <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">Sin recepciones registradas.</div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2">Orden</th><th className="px-3 py-2">Remito</th><th className="px-3 py-2">Fecha</th><th className="px-3 py-2">Sucursal</th><th className="px-3 py-2">Estado</th></tr></thead>
              <tbody>
                {recepciones.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-3 py-1.5 font-mono text-xs">{r.orden}</td>
                    <td className="px-3 py-1.5 text-xs">{r.remito ?? '—'}</td>
                    <td className="px-3 py-1.5 text-xs">{r.fecha}</td>
                    <td className="px-3 py-1.5">{r.sucursal}</td>
                    <td className="px-3 py-1.5"><Badge variant={EST_VARIANT[r.estado] ?? 'outline'} className="font-normal">{r.estado.replace(/_/g, ' ')}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {recibir && <RecibirSheet orden={recibir} onClose={() => setRecibir(null)} />}
    </div>
  )
}

function RecibirSheet({ orden, onClose }: { orden: OrdenRecibible; onClose: () => void }) {
  const router = useRouter()
  const [remito, setRemito] = useState('')
  const [numFactura, setNumFactura] = useState('')
  const [lineas, setLineas] = useState(orden.items.map((i) => ({ ...i, recibida: String(i.cantidad), danada: '', venc: '' })))
  const [busy, setBusy] = useState(false)

  function set(idx: number, k: 'recibida' | 'danada' | 'venc', v: string) { setLineas((p) => p.map((l, i) => i === idx ? { ...l, [k]: v } : l)) }

  async function submit() {
    setBusy(true)
    try {
      const r = await fetch('/api/compras/recepciones', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          orden_id: orden.id, numero_remito: remito || null, numero_factura: numFactura || null, generar_factura: true,
          items: lineas.map((l) => ({ producto_id: l.producto_id, descripcion: l.nombre, cantidad_pedida: l.cantidad, cantidad_recibida: Number(l.recibida) || 0, cantidad_danada: Number(l.danada) || 0, fecha_vencimiento: l.venc || null })),
        }),
      })
      const j = await r.json(); if (!r.ok) throw new Error(j?.error)
      toast.success(`Recepción registrada. ${j.transferencias} transferencia(s) generada(s)${j.con_diferencias ? ' · con diferencias' : ''}.`)
      onClose(); router.refresh()
    } catch (e: any) { toast.error(e?.message ?? 'Error') } finally { setBusy(false) }
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-2xl">
        <SheetHeader><SheetTitle>Recibir {orden.codigo} · {orden.proveedor}</SheetTitle></SheetHeader>
        <div className="flex flex-1 flex-col gap-4 pt-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Nº remito</Label><Input value={remito} onChange={(e) => setRemito(e.target.value)} /></div>
            <div className="space-y-1.5"><Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Nº factura</Label><Input value={numFactura} onChange={(e) => setNumFactura(e.target.value)} placeholder="opcional" /></div>
          </div>
          <p className="text-[11px] text-muted-foreground">Recibe en <b>{orden.sucursal}</b>. Se genera factura borrador a Finanzas y transferencias automáticas a las otras sucursales.</p>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-2 py-2">Producto</th><th className="px-2 py-2 text-right">Pedido</th><th className="px-2 py-2 text-center">Recibido</th><th className="px-2 py-2 text-center">Dañado</th><th className="px-2 py-2 text-center">Vence</th></tr></thead>
              <tbody>
                {lineas.map((l, i) => (
                  <tr key={l.producto_id} className="border-t border-border">
                    <td className="px-2 py-1.5"><div className="font-medium">{l.nombre}</div><div className="font-mono text-[10px] text-muted-foreground">{l.sku}</div></td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{l.cantidad}</td>
                    <td className="px-1 py-1.5"><Input type="number" value={l.recibida} onChange={(e) => set(i, 'recibida', e.target.value)} className={cn('h-7 w-16 text-center text-xs', (Number(l.recibida) || 0) < l.cantidad && 'border-amber-500/60')} /></td>
                    <td className="px-1 py-1.5"><Input type="number" value={l.danada} onChange={(e) => set(i, 'danada', e.target.value)} className="h-7 w-14 text-center text-xs" /></td>
                    <td className="px-1 py-1.5"><Input type="date" value={l.venc} onChange={(e) => set(i, 'venc', e.target.value)} className="h-7 w-32 text-xs" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button size="lg" disabled={busy} onClick={submit}>{busy ? 'Registrando…' : 'Confirmar recepción'}</Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
