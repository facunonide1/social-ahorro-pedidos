'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, Loader2, CalendarClock, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'

import { formatARS } from '@/lib/utils/format'
import { type PresentacionFila, ESTADO_LABEL, estadoDeTroqueles } from '@/lib/convenios/presentaciones'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type Cierre = {
  convenio_id: string; convenio: string; sucursal_id: string; sucursal: string
  cierre: string | null; dias: number | null; aviso_dias_antes: number
  troquel: string | null; por_que_no_se_sabe: string | null
  ya_presentada: boolean; comprobantes_sueltos: number
}
type ConvLite = { id: string; nombre: string; plazo_presentacion_dias: number | null; modo_presentacion: string | null }
type SucLite = { id: string; nombre: string }

export function PresentacionesClient({
  presentaciones, cierres, convenios, sucursales, miSucursal, puedeCrear,
}: {
  presentaciones: PresentacionFila[]
  cierres: Cierre[]
  convenios: ConvLite[]
  sucursales: SucLite[]
  miSucursal: string | null
  puedeCrear: boolean
}) {
  const [abierto, setAbierto] = useState(false)

  // B.5 · los que cierran dentro de su propia anticipación y no están armados.
  // La anticipación es por convenio: uno que pide troquel físico necesita más
  // días que uno digital.
  const urgentes = cierres.filter(
    (c) => c.dias != null && !c.ya_presentada && c.dias <= c.aviso_dias_antes,
  )
  const sinCalcular = cierres.filter((c) => c.cierre == null)

  if (!convenios.length) {
    return (
      <div className="max-w-xl space-y-2 rounded-lg border border-dashed p-5">
        <h2 className="font-medium">No hay convenios cargados, así que no hay nada que presentar.</h2>
        <p className="text-sm leading-snug text-muted-foreground">
          Una presentación es siempre a una obra social y de una sucursal. Mientras el padrón esté
          vacío, no hay a quién presentarle.
        </p>
        <Button variant="outline" asChild className="mt-1">
          <Link href="/admin/convenios/padron">Ir al padrón</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ── B.5 · EL AVISO ANTES DEL CIERRE ─────────────────────────────── */}
      <section className="space-y-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <CalendarClock className="size-3.5" /> Lo que cierra pronto
        </h2>

        {urgentes.length === 0 && sinCalcular.length === 0 && (
          <p className="rounded-lg border border-dashed p-3 text-xs leading-snug text-muted-foreground">
            Ningún convenio cierra dentro de su plazo de aviso. Los cierres se calculan con la
            periodicidad y el día de cierre de cada convenio.
          </p>
        )}

        {urgentes.length > 0 && (
          <div className="divide-y rounded-lg border border-amber-500/40">
            {urgentes.map((c) => (
              <div key={`${c.convenio_id}-${c.sucursal_id}`} className="flex flex-wrap items-center gap-2 p-3 text-sm">
                <AlertTriangle className="size-4 text-amber-600" />
                <span className="font-medium">{c.convenio}</span>
                <span className="text-muted-foreground">{c.sucursal}</span>
                <Badge variant="outline" className="text-[10px]">
                  cierra en {c.dias} día{c.dias === 1 ? '' : 's'}
                </Badge>
                {c.troquel === 'fisico' && (
                  <Badge variant="outline" className="text-[10px]">troquel físico</Badge>
                )}
                <span className="text-xs text-muted-foreground">
                  {c.comprobantes_sueltos > 0
                    ? `${c.comprobantes_sueltos} comprobante(s) sin presentar`
                    : 'sin comprobantes cargados todavía'}
                </span>
              </div>
            ))}
          </div>
        )}

        {sinCalcular.length > 0 && (
          <p className="text-xs leading-snug text-muted-foreground">
            De {sinCalcular.length} convenio/sucursal no se puede calcular el cierre:{' '}
            {Array.from(new Set(sinCalcular.map((c) => c.por_que_no_se_sabe))).join('; ')}. Sin esa
            fecha el aviso no es que suene tarde, es que no existe.
          </p>
        )}
      </section>

      {/* ── LAS PRESENTACIONES ──────────────────────────────────────────── */}
      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Presentaciones
          </h2>
          {puedeCrear && (
            <Button onClick={() => setAbierto(true)}>
              <Plus className="size-4" /> Armar una presentación
            </Button>
          )}
        </div>

        {!presentaciones.length ? (
          <p className="rounded-lg border border-dashed p-4 text-sm leading-snug text-muted-foreground">
            No hay ninguna presentación armada. Una presentación junta los comprobantes de un
            período y se manda a la obra social: es el paso que hoy no está en ningún sistema.
          </p>
        ) : (
          <div className="divide-y rounded-lg border">
            {presentaciones.map((p) => {
              const tro = estadoDeTroqueles(p.troqueles)
              return (
                <div key={p.id} className="space-y-1 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/admin/convenios/presentaciones/${p.id}`} className="font-medium hover:underline">
                      {p.convenio}
                    </Link>
                    <span className="text-sm text-muted-foreground">{p.sucursal}</span>
                    <Badge variant={p.estado === 'enviada' ? 'default' : 'outline'} className="text-[10px]">
                      {ESTADO_LABEL[p.estado]}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {p.periodo_desde} → {p.periodo_hasta}
                    </span>
                    <span className="ml-auto text-sm tabular-nums">
                      {p.total_declarado != null ? formatARS(p.total_declarado) : '—'}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-x-4 text-xs text-muted-foreground">
                    <span>
                      {p.cantidad_comprobantes ?? 0} comprobante
                      {p.cantidad_comprobantes === 1 ? '' : 's'}
                    </span>
                    {p.excluidos > 0 && (
                      <span>{p.excluidos} quedaron afuera, con motivo</span>
                    )}
                    {p.fecha_envio && <span>enviada el {p.fecha_envio}</span>}
                    {p.tarea_control_id && <span>con tarea de control</span>}
                  </div>

                  <p className={`text-xs leading-snug ${tro.riesgo ? 'text-amber-700 dark:text-amber-500' : 'text-muted-foreground'}`}>
                    {tro.texto}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <HojaNueva
        abierto={abierto} setAbierto={setAbierto}
        convenios={convenios} sucursales={sucursales} miSucursal={miSucursal}
      />
    </div>
  )
}

function HojaNueva({ abierto, setAbierto, convenios, sucursales, miSucursal }: {
  abierto: boolean; setAbierto: (v: boolean) => void
  convenios: ConvLite[]; sucursales: SucLite[]; miSucursal: string | null
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const hoy = new Date()
  const primero = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10)
  const ultimo = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).toISOString().slice(0, 10)

  const [f, setF] = useState({
    convenio_id: '', sucursal_id: miSucursal ?? '',
    periodo_desde: primero, periodo_hasta: ultimo, notas: '',
  })
  const conv = convenios.find((c) => c.id === f.convenio_id)

  async function crear() {
    if (!f.convenio_id) { toast.error('Elegí el convenio.'); return }
    if (!f.sucursal_id) {
      toast.error('Falta la sucursal.', {
        description: 'Una presentación sin sucursal no se puede atribuir, y un débito sin sucursal tampoco.',
      })
      return
    }
    setBusy(true)
    try {
      const r = await fetch('/api/convenios/presentaciones', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accion: 'crear', ...f }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error ?? 'No se pudo armar.')
      toast.success('Presentación armada, en borrador.')
      setAbierto(false)
      router.push(`/admin/convenios/presentaciones/${j.id}`)
    } catch (e: any) { toast.error(e?.message ?? 'Falló.') } finally { setBusy(false) }
  }

  return (
    <Sheet open={abierto} onOpenChange={setAbierto}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader><SheetTitle>Armar una presentación</SheetTitle></SheetHeader>
        <div className="mt-4 space-y-4">
          <div className="space-y-1">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Obra social</Label>
            <Select value={f.convenio_id} onValueChange={(v) => setF({ ...f, convenio_id: v })}>
              <SelectTrigger><SelectValue placeholder="Elegí" /></SelectTrigger>
              <SelectContent>
                {convenios.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
            {conv?.modo_presentacion === 'consolidada' && (
              <p className="text-[11px] leading-snug text-muted-foreground">
                Este convenio se presenta <b>consolidado</b> para la cadena. La presentación se arma
                igual con una sucursal: el origen de cada comprobante se conserva para poder
                atribuir un débito después.
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Sucursal</Label>
            <Select value={f.sucursal_id} onValueChange={(v) => setF({ ...f, sucursal_id: v })}
              disabled={!!miSucursal}>
              <SelectTrigger><SelectValue placeholder="Elegí" /></SelectTrigger>
              <SelectContent>
                {sucursales.map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
            {miSucursal && (
              <p className="text-[11px] text-muted-foreground">
                Armás las de tu sucursal. Las de las otras las arma su encargado.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Desde</Label>
              <Input type="date" value={f.periodo_desde}
                onChange={(e) => setF({ ...f, periodo_desde: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Hasta</Label>
              <Input type="date" value={f.periodo_hasta}
                onChange={(e) => setF({ ...f, periodo_hasta: e.target.value })} />
            </div>
          </div>

          {conv?.plazo_presentacion_dias == null && conv && (
            <p className="text-[11px] leading-snug text-amber-700 dark:text-amber-500">
              Este convenio no tiene cargado el plazo de presentación, así que el sistema no puede
              decir si este período todavía está a tiempo.
            </p>
          )}

          <Button size="lg" className="w-full" disabled={busy} onClick={crear}>
            {busy && <Loader2 className="size-4 animate-spin" />} Armar en borrador
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
