'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, Check, Info, Truck, Home, Store, Clock } from 'lucide-react'
import { toast } from 'sonner'

import { formatARS } from '@/lib/utils/format'
import { cuandoSeLeyoElStock } from '@/lib/mostrador/buscar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'

type Prod = {
  producto_id: string; nombre: string; sku: string
  presentacion: string | null; laboratorio: string | null; precio: number | null
}
type Donde = {
  sucursal_id: string; sucursal: string; codigo: string
  direccion: string | null; telefono: string | null
  stock: number; reservado: number; disponible: number
  leido_at: string | null; es_la_mia: boolean
}
type Salida = {
  salida: string; titulo: string; disponible: boolean
  por_que_no: string | null; que_hace: string
}

const ICONO: Record<string, any> = {
  transferencia: Truck, reparto_hoy: Clock, a_domicilio: Home, retiro_otra: Store,
}

export function DondeHayClient({ producto: p, donde, salidas, puedeTomar }: {
  producto: Prod; donde: Donde[]; salidas: Salida[]; puedeTomar: boolean
}) {
  const router = useRouter()
  const [elegida, setElegida] = useState<Donde | null>(
    donde.find((d) => !d.es_la_mia && d.disponible > 0) ?? null,
  )
  const [salida, setSalida] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [hecho, setHecho] = useState<any>(null)
  const [cli, setCli] = useState({ nombre: '', telefono: '', direccion: '' })

  const conStock = donde.filter((d) => !d.es_la_mia && d.disponible > 0)
  const mia = donde.find((d) => d.es_la_mia)

  async function resolver() {
    if (!elegida || !salida) return
    setBusy(true)
    try {
      const r = await fetch('/api/mostrador/resolver', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          producto_id: p.producto_id, sucursal_tiene: elegida.sucursal_id,
          salida, cantidad: 1,
          cliente_nombre: cli.nombre || null,
          cliente_telefono: cli.telefono || null,
          direccion: cli.direccion || null,
        }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error ?? 'No se pudo.')
      setHecho(j)
      toast.success('Listo.', { description: j.que_decirle })
      router.refresh()
    } catch (e: any) { toast.error(e?.message ?? 'Falló.') } finally { setBusy(false) }
  }

  // ── LO QUE SE LE DICE AL CLIENTE, DESPUÉS ─────────────────────────────
  if (hecho) {
    return (
      <div className="mx-auto max-w-2xl p-4">
        <div className="space-y-4 rounded-lg border p-4">
          <div className="flex items-start gap-2">
            <Check className="mt-0.5 size-5 shrink-0" />
            <div>
              <p className="font-medium">{hecho.que_decirle}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Queda reservado hasta el{' '}
                {new Date(hecho.reserva_vence_at).toLocaleString('es-AR')}.
                {hecho.pedido_numero && <> Pedido #{hecho.pedido_numero}.</>}
              </p>
            </div>
          </div>
          <p className="border-l-2 border-foreground/40 pl-3 text-xs leading-snug text-muted-foreground">
            {hecho.ojo}
          </p>
          <p className="text-xs leading-snug text-muted-foreground">
            <b>La venta se hace en SIFACO</b> cuando el producto esté acá. Esto dejó el pedido y
            apartó la unidad; no facturó nada.
          </p>
          <div className="flex gap-2">
            <Button asChild size="lg" className="h-12 flex-1">
              <Link href="/mostrador">Volver al mostrador</Link>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background/95 p-3 backdrop-blur">
        <Button size="icon" variant="ghost" asChild className="size-10 shrink-0">
          <Link href={`/mostrador/${p.producto_id}`} aria-label="Volver">
            <ArrowLeft className="size-5" />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium leading-tight">{p.nombre}</div>
          <div className="truncate text-xs text-muted-foreground">
            {[p.presentacion, p.laboratorio].filter(Boolean).join(' · ')}
          </div>
        </div>
        {p.precio != null && (
          <div className="shrink-0 font-semibold tabular-nums">{formatARS(p.precio)}</div>
        )}
      </header>

      <div className="space-y-5 p-3">
        {/* ── C.1 · DÓNDE HAY ─────────────────────────────────────────── */}
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Dónde hay
          </h2>

          {conStock.length === 0 ? (
            <div className="space-y-2 rounded-lg border border-dashed p-4">
              <p className="text-sm"><b>No hay en ninguna sucursal.</b></p>
              <p className="text-xs leading-snug text-muted-foreground">
                Según la última foto de SIFACO, ninguna de las cuatro tiene stock disponible de
                este producto.
              </p>
              {/* C.5 · cuando no hay en ninguna, va al bloque D. */}
              <Button asChild size="lg" className="h-12 w-full">
                <Link href={`/mostrador/faltante?producto=${p.producto_id}`}>
                  Registrar que lo pidieron y no hay
                </Link>
              </Button>
            </div>
          ) : (
            <ul className="divide-y rounded-lg border">
              {donde.map((d) => (
                <li key={d.sucursal_id}>
                  <button
                    disabled={d.es_la_mia || d.disponible <= 0}
                    onClick={() => setElegida(d)}
                    className={`flex w-full items-start gap-3 p-3 text-left ${
                      elegida?.sucursal_id === d.sucursal_id ? 'bg-muted' : ''
                    } ${d.es_la_mia || d.disponible <= 0 ? 'opacity-60' : 'hover:bg-muted/50'}`}>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{d.sucursal}</span>
                        {d.es_la_mia && (
                          <Badge variant="outline" className="text-[10px]">acá</Badge>
                        )}
                      </div>
                      {d.direccion && (
                        <div className="text-xs text-muted-foreground">{d.direccion}</div>
                      )}
                      {/* C.6 · de cuándo es la foto de ESA sucursal. */}
                      <div className="text-[11px] text-muted-foreground">
                        {cuandoSeLeyoElStock(d.leido_at)}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-lg font-semibold tabular-nums">
                        {Math.round(d.disponible)}
                      </div>
                      {d.reservado > 0 && (
                        <div className="text-[11px] text-muted-foreground">
                          {Math.round(d.reservado)} reservadas
                        </div>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── C.2 · LAS CUATRO SALIDAS ────────────────────────────────── */}
        {conStock.length > 0 && puedeTomar && elegida && (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Qué le ofrecés
            </h2>
            <p className="text-xs text-muted-foreground">
              Desde <b>{elegida.sucursal}</b>, que es la que lo tiene.
            </p>

            <div className="space-y-2">
              {salidas.map((s) => {
                const Icono = ICONO[s.salida] ?? Truck
                const activa = salida === s.salida
                return (
                  <div key={s.salida}>
                    <button
                      disabled={!s.disponible}
                      onClick={() => setSalida(activa ? null : s.salida)}
                      className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left ${
                        activa ? 'border-foreground' : ''
                      } ${!s.disponible ? 'opacity-50' : 'hover:bg-muted/40'}`}>
                      <Icono className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{s.titulo}</div>
                        <div className="text-xs leading-snug text-muted-foreground">
                          {s.disponible ? s.que_hace : s.por_que_no}
                        </div>
                      </div>
                    </button>

                    {activa && (
                      <div className="mt-2 space-y-2 rounded-lg border border-dashed p-3">
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div className="space-y-1">
                            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                              Nombre
                            </Label>
                            <Input className="h-12 text-base" value={cli.nombre}
                              onChange={(e) => setCli({ ...cli, nombre: e.target.value })} />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                              Teléfono
                            </Label>
                            <Input className="h-12 text-base" inputMode="tel" value={cli.telefono}
                              onChange={(e) => setCli({ ...cli, telefono: e.target.value })} />
                          </div>
                        </div>
                        {s.salida === 'a_domicilio' && (
                          <div className="space-y-1">
                            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                              Dirección
                            </Label>
                            <Input className="h-12 text-base" value={cli.direccion}
                              onChange={(e) => setCli({ ...cli, direccion: e.target.value })} />
                          </div>
                        )}
                        <p className="text-[11px] leading-snug text-muted-foreground">
                          El nombre y el teléfono son para poder avisarle cuando llegue. Nada más:
                          <b> por qué lo compra no se guarda en ningún lado</b>.
                        </p>
                        <Button size="lg" className="h-12 w-full" disabled={busy} onClick={resolver}>
                          {busy ? <Loader2 className="size-5 animate-spin" /> : <Check className="size-5" />}
                          Confirmar y reservar
                        </Button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {mia && (
          <div className="flex gap-2 border-l-2 border-foreground/40 bg-muted/30 p-3">
            <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <p className="text-xs leading-snug text-muted-foreground">
              Acá hay {Math.round(mia.disponible)}. El stock es una foto diaria de SIFACO: si el
              otro local lo vendió hoy, puede no estar. La reserva lo aparta en NORA, no en SIFACO.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
