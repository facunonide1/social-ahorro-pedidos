'use client'

import { useState, useTransition } from 'react'
import { ArrowDown, ArrowUp, Truck } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'

import { armarViaje, cambiarEstadoViaje } from './actions'

type Pedido = {
  id: string; codigo: string; status: string; customer_name: string | null
  shipping_address: any; total: number; sucursal_id: string | null; zona_id: string | null
}
type Sucursal = { id: string; nombre: string; codigo: string | null }
type Zona = { id: string; nombre: string; sucursal_id: string | null }
type Repartidor = { id: string; name: string | null; email: string }

function direccion(p: Pedido): string {
  const a = p.shipping_address ?? {}
  return [a.address_1, a.city].filter(Boolean).join(', ') || 'sin dirección'
}

export function ViajesClient({
  pendientes, sucursales, zonas, repartidores, viajes,
}: {
  pendientes: Pedido[]; sucursales: Sucursal[]; zonas: Zona[]
  repartidores: Repartidor[]; viajes: any[]
}) {
  const [sucursalId, setSucursalId] = useState('')
  const [zonaId, setZonaId] = useState('')
  const [repartidorId, setRepartidorId] = useState('')
  const [elegidos, setElegidos] = useState<string[]>([])
  const [pendiente, empezar] = useTransition()

  // Se filtra por la sucursal elegida: un viaje sale de un local, no de "todos".
  const candidatos = pendientes.filter(
    (p) => (!sucursalId || p.sucursal_id === sucursalId) && (!zonaId || p.zona_id === zonaId),
  )
  const zonasDeSucursal = zonas.filter((z) => !sucursalId || z.sucursal_id === sucursalId)

  function mover(i: number, d: -1 | 1) {
    setElegidos((e) => {
      const j = i + d
      if (j < 0 || j >= e.length) return e
      const c = [...e]; [c[i], c[j]] = [c[j], c[i]]; return c
    })
  }

  function armar() {
    const fd = new FormData()
    fd.set('sucursal_id', sucursalId)
    fd.set('zona_id', zonaId)
    fd.set('repartidor_id', repartidorId)
    for (const id of elegidos) fd.append('order_id', id)
    empezar(async () => {
      const r = await armarViaje(fd)
      if (r?.error) toast.error(r.error)
      else { toast.success('Viaje armado'); setElegidos([]) }
    })
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Armar un viaje</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-3">
              <Sel l="Sucursal *" v={sucursalId} on={(v) => { setSucursalId(v); setZonaId(''); setElegidos([]) }}
                opciones={sucursales.map((s) => ({ v: s.id, t: s.nombre }))} />
              <Sel l="Zona" v={zonaId} on={setZonaId}
                opciones={zonasDeSucursal.map((z) => ({ v: z.id, t: z.nombre }))} />
              <Sel l="Repartidor" v={repartidorId} on={setRepartidorId}
                opciones={repartidores.map((r) => ({ v: r.id, t: r.name ?? r.email }))} />
            </div>

            {!sucursalId ? (
              <p className="text-xs text-muted-foreground">Elegí la sucursal de la que sale el viaje.</p>
            ) : candidatos.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No hay pedidos de reparto propio esperando salir en esta sucursal.
              </p>
            ) : (
              <div className="max-h-[340px] divide-y divide-border overflow-y-auto rounded-md border border-border">
                {candidatos.map((p) => {
                  const puesto = elegidos.indexOf(p.id)
                  return (
                    <button key={p.id} type="button"
                      onClick={() => setElegidos((e) => e.includes(p.id) ? e.filter((x) => x !== p.id) : [...e, p.id])}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${puesto >= 0 ? 'bg-primary/5' : 'hover:bg-accent'}`}>
                      <span className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                        puesto >= 0 ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground'}`}>
                        {puesto >= 0 ? puesto + 1 : ''}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{p.codigo} · {p.customer_name ?? 'sin nombre'}</span>
                        <span className="block truncate text-xs text-muted-foreground">{direccion(p)}</span>
                      </span>
                      <Badge variant="outline" className="shrink-0 text-[10px]">{p.status}</Badge>
                    </button>
                  )
                })}
              </div>
            )}

            {elegidos.length > 0 && (
              <div className="space-y-1.5 rounded-md border border-border p-2">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  El orden lo ponés vos
                </Label>
                {elegidos.map((id, i) => {
                  const p = pendientes.find((x) => x.id === id)!
                  return (
                    <div key={id} className="flex items-center gap-2 text-sm">
                      <span className="w-5 text-center text-xs text-muted-foreground">{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate">{p.codigo} · {direccion(p)}</span>
                      <Button variant="ghost" size="icon" className="size-7" onClick={() => mover(i, -1)}>
                        <ArrowUp className="size-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="size-7" onClick={() => mover(i, 1)}>
                        <ArrowDown className="size-3.5" />
                      </Button>
                    </div>
                  )
                })}
                <Button className="mt-2 w-full gap-1" disabled={pendiente || !sucursalId} onClick={armar}>
                  <Truck className="size-4" /> Armar el viaje con {elegidos.length}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Viajes</h2>
        {viajes.length === 0 && <p className="text-sm text-muted-foreground">Todavía no hay viajes armados.</p>}
        {viajes.map((v) => (
          <div key={v.id} className="rounded-lg border border-border p-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{v.sucursales?.nombre ?? 'sin sucursal'}</span>
              {v.zonas_reparto?.nombre && <Badge variant="outline" className="text-[10px]">{v.zonas_reparto.nombre}</Badge>}
              <Badge variant="outline" className="ml-auto text-[10px]">{v.estado}</Badge>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {v.fecha} · {(v.viaje_pedidos ?? []).length} pedidos
            </div>
            <ol className="mt-2 space-y-0.5 text-xs">
              {[...(v.viaje_pedidos ?? [])].sort((a: any, b: any) => a.orden - b.orden).map((vp: any) => (
                <li key={vp.order_id} className="flex gap-2">
                  <span className="text-muted-foreground">{vp.orden}.</span>
                  <span className="truncate">{vp.orders?.codigo} · {vp.orders?.customer_name ?? '—'}</span>
                </li>
              ))}
            </ol>
            {v.estado !== 'cerrado' && v.estado !== 'cancelado' && (
              <form action={(fd) => { empezar(async () => { const r = await cambiarEstadoViaje(fd); if (r?.error) toast.error(r.error) }) }}
                className="mt-2 flex gap-2">
                <input type="hidden" name="id" value={v.id} />
                <input type="hidden" name="estado" value={v.estado === 'armado' ? 'en_calle' : 'cerrado'} />
                <Button type="submit" size="sm" variant="outline" disabled={pendiente}>
                  {v.estado === 'armado' ? 'Salió a la calle' : 'Cerrar el viaje'}
                </Button>
              </form>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function Sel({ l, v, on, opciones }: {
  l: string; v: string; on: (v: string) => void; opciones: { v: string; t: string }[]
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{l}</Label>
      <select value={v} onChange={(e) => on(e.target.value)}
        className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm">
        <option value="">Todas</option>
        {opciones.map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}
      </select>
    </div>
  )
}
