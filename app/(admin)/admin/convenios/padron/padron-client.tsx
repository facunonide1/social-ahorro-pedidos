'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, Loader2, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'

import {
  type ConvenioFila, TIPO_LABEL, TROQUEL_LABEL, PERIODICIDAD_LABEL, MODO_LABEL,
  proximoCierre,
} from '@/lib/convenios/padron'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

/**
 * A.1 · EL PADRÓN, EN PANTALLA.
 *
 * ── POR QUÉ CADA FILA DICE QUÉ LE FALTA ─────────────────────────────────────
 *
 * Un convenio sin plazo de presentación se guarda igual —no se puede exigir
 * que alguien sepa todo el primer día— pero el sistema no puede avisar antes
 * del cierre, y sin saber qué exige no puede explicar un débito.
 *
 * Entonces la fila lo dice. La alternativa es una lista de convenios que se ve
 * completa y un aviso que nunca suena.
 */

const VACIO = '__'

export function PadronClient({ convenios, puedeCrear, puedeEditar }: {
  convenios: ConvenioFila[]
  puedeCrear: boolean
  puedeEditar: boolean
}) {
  const [abierto, setAbierto] = useState(false)
  const [editando, setEditando] = useState<ConvenioFila | null>(null)

  if (!convenios.length) {
    return (
      <div className="space-y-4">
        {/* F.4 · la pantalla vacía bien hecha: qué falta y qué la enciende. */}
        <div className="max-w-xl space-y-2 rounded-lg border border-dashed p-5">
          <h2 className="font-medium">No hay ningún convenio cargado.</h2>
          <p className="text-sm leading-snug text-muted-foreground">
            Entre el 50% y el 70% de lo que despacha la farmacia pasa por una obra social.
            Mientras el padrón esté vacío, NORA no puede avisar antes de un cierre de
            presentación ni decir si un débito todavía se puede reclamar: no es que no haya
            nada, es que no hay con qué mirarlo.
          </p>
          <p className="text-sm leading-snug text-muted-foreground">
            Lo que lo enciende: <b>la lista de obras sociales con las que trabajan</b>, con el
            plazo de presentación y qué exige cada una.
          </p>
          {puedeCrear && (
            <Button className="mt-1" onClick={() => { setEditando(null); setAbierto(true) }}>
              <Plus className="size-4" /> Cargar el primero
            </Button>
          )}
        </div>
        <Hoja abierto={abierto} setAbierto={setAbierto} convenio={null} />
      </div>
    )
  }

  const incompletos = convenios.filter((c) => c.le_falta.length > 0).length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {convenios.length} convenio{convenios.length === 1 ? '' : 's'} ·{' '}
          {convenios.filter((c) => c.activo).length} activo
          {incompletos > 0 && (
            <> · <b className="text-foreground">{incompletos} sin terminar de cargar</b></>
          )}
        </p>
        {puedeCrear && (
          <Button onClick={() => { setEditando(null); setAbierto(true) }}>
            <Plus className="size-4" /> Nuevo convenio
          </Button>
        )}
      </div>

      <div className="divide-y rounded-lg border">
        {convenios.map((c) => {
          const cierre = proximoCierre(c)
          return (
            <div key={c.id} className="flex items-start gap-3 p-3">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/admin/convenios/padron/${c.id}`} className="font-medium hover:underline">
                    {c.nombre}
                  </Link>
                  {c.sigla && <code className="text-xs text-muted-foreground">{c.sigla}</code>}
                  <Badge variant="outline" className="text-[10px]">{TIPO_LABEL[c.tipo]}</Badge>
                  {!c.activo && <Badge variant="secondary" className="text-[10px]">inactivo</Badge>}
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                  <span>
                    Cubre:{' '}
                    {c.cobertura_general_pct != null
                      ? <b>{c.cobertura_general_pct}%</b>
                      : <i>no cargado</i>}
                  </span>
                  <span>
                    Presenta hasta:{' '}
                    {c.plazo_presentacion_dias != null
                      ? <b>{c.plazo_presentacion_dias} días</b>
                      : <i>no cargado</i>}
                  </span>
                  <span>
                    Paga a:{' '}
                    {c.plazo_pago_dias != null
                      ? <b>{c.plazo_pago_dias} días</b>
                      : <i>no cargado</i>}
                  </span>
                  {c.troquel && <span>{TROQUEL_LABEL[c.troquel]}</span>}
                  {c.periodicidad && <span>{PERIODICIDAD_LABEL[c.periodicidad]}</span>}
                  {c.modo_presentacion && <span>{MODO_LABEL[c.modo_presentacion]}</span>}
                </div>

                <p className="text-xs text-muted-foreground">
                  Próximo cierre:{' '}
                  {cierre.fecha
                    ? <b className="text-foreground">{cierre.fecha}</b>
                    : <>no se puede calcular — {cierre.por_que_no}</>}
                </p>

                {c.le_falta.length > 0 && (
                  <p className="text-xs leading-snug text-amber-700 dark:text-amber-500">
                    Falta cargar: {c.le_falta.join('; ')}.
                  </p>
                )}
              </div>

              {puedeEditar && (
                <Button size="sm" variant="ghost"
                  onClick={() => { setEditando(c); setAbierto(true) }}>
                  Editar
                </Button>
              )}
              <Button size="icon" variant="ghost" asChild className="size-8">
                <Link href={`/admin/convenios/padron/${c.id}`}><ChevronRight className="size-4" /></Link>
              </Button>
            </div>
          )
        })}
      </div>

      <Hoja abierto={abierto} setAbierto={setAbierto} convenio={editando} />
    </div>
  )
}

function Hoja({ abierto, setAbierto, convenio }: {
  abierto: boolean; setAbierto: (v: boolean) => void; convenio: ConvenioFila | null
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [f, setF] = useState(() => desde(convenio))

  // La hoja se remonta con `key`, así que el estado arranca del convenio que
  // se está editando sin necesidad de sincronizarlo después.
  function desde(c: ConvenioFila | null) {
    return {
      nombre: c?.nombre ?? '', sigla: c?.sigla ?? '', tipo: c?.tipo ?? 'obra_social',
      cuit: '', activo: c?.activo ?? true,
      cobertura_general_pct: c?.cobertura_general_pct?.toString() ?? '',
      plazo_presentacion_dias: c?.plazo_presentacion_dias?.toString() ?? '',
      plazo_pago_dias: c?.plazo_pago_dias?.toString() ?? '',
      troquel: c?.troquel ?? VACIO,
      periodicidad: c?.periodicidad ?? VACIO,
      modo_presentacion: c?.modo_presentacion ?? VACIO,
      dia_cierre: c?.dia_cierre?.toString() ?? '',
      aviso_dias_antes: (c?.aviso_dias_antes ?? 7).toString(),
      firmado_at: c?.firmado_at ?? '', notas: c?.notas ?? '',
    }
  }
  const set = (k: string, v: any) => setF((p) => ({ ...p, [k]: v }))

  async function guardar() {
    if (!f.nombre.trim()) { toast.error('Falta el nombre.'); return }
    setBusy(true)
    try {
      const limpio = (v: string) => (v === VACIO ? null : v)
      const r = await fetch('/api/convenios', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          accion: convenio ? 'editar_convenio' : 'alta_convenio',
          id: convenio?.id, ...f,
          troquel: limpio(f.troquel),
          periodicidad: limpio(f.periodicidad),
          modo_presentacion: limpio(f.modo_presentacion),
        }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error ?? 'No se pudo guardar.')
      toast.success(convenio ? 'Convenio actualizado.' : 'Convenio cargado.')
      setAbierto(false); router.refresh()
    } catch (e: any) { toast.error(e?.message ?? 'Falló.') } finally { setBusy(false) }
  }

  return (
    <Sheet key={convenio?.id ?? 'nuevo'} open={abierto} onOpenChange={setAbierto}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{convenio ? convenio.nombre : 'Nuevo convenio'}</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <Campo label="Nombre">
            <Input value={f.nombre} onChange={(e) => set('nombre', e.target.value)}
              placeholder="OSDE, IOMA, PAMI…" />
          </Campo>

          <div className="grid gap-3 sm:grid-cols-2">
            <Campo label="Sigla">
              <Input value={f.sigla} onChange={(e) => set('sigla', e.target.value)} />
            </Campo>
            <Campo label="Tipo">
              <Select value={f.tipo} onValueChange={(v) => set('tipo', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TIPO_LABEL).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Campo>
          </div>

          <Campo label="Qué porcentaje cubre, en general"
            ayuda="Si varía según el tipo de producto, se deja vacío y se carga el desglose en la ficha del convenio.">
            <Input type="number" value={f.cobertura_general_pct} placeholder="vacío = no se sabe"
              onChange={(e) => set('cobertura_general_pct', e.target.value)} />
          </Campo>

          <div className="grid gap-3 sm:grid-cols-2">
            <Campo label="Plazo de presentación (días)"
              ayuda="Hasta cuántos días después del despacho se puede presentar.">
              <Input type="number" value={f.plazo_presentacion_dias}
                onChange={(e) => set('plazo_presentacion_dias', e.target.value)} />
            </Campo>
            <Campo label="Plazo de pago (días)" ayuda="A cuántos días paga, declarado.">
              <Input type="number" value={f.plazo_pago_dias}
                onChange={(e) => set('plazo_pago_dias', e.target.value)} />
            </Campo>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Campo label="Troquel">
              <Select value={f.troquel} onValueChange={(v) => set('troquel', v)}>
                <SelectTrigger><SelectValue placeholder="no se sabe" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={VACIO}>no se sabe</SelectItem>
                  {Object.entries(TROQUEL_LABEL).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Campo>
            <Campo label="Cada cuánto se presenta">
              <Select value={f.periodicidad} onValueChange={(v) => set('periodicidad', v)}>
                <SelectTrigger><SelectValue placeholder="no se sabe" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={VACIO}>no se sabe</SelectItem>
                  {Object.entries(PERIODICIDAD_LABEL).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Campo>
          </div>

          <Campo label="La presentación es…"
            ayuda="Consolidada significa una sola presentación para las cuatro sucursales. Cambia cómo se arma y cómo se reparte un débito.">
            <Select value={f.modo_presentacion} onValueChange={(v) => set('modo_presentacion', v)}>
              <SelectTrigger><SelectValue placeholder="no se sabe" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={VACIO}>no se sabe</SelectItem>
                {Object.entries(MODO_LABEL).map(([v, l]) => (
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Campo>

          <div className="grid gap-3 sm:grid-cols-2">
            <Campo label="Día de cierre" ayuda="Del 1 al 31.">
              <Input type="number" min={1} max={31} value={f.dia_cierre}
                onChange={(e) => set('dia_cierre', e.target.value)} />
            </Campo>
            <Campo label="Avisar con (días de anticipación)">
              <Input type="number" min={0} value={f.aviso_dias_antes}
                onChange={(e) => set('aviso_dias_antes', e.target.value)} />
            </Campo>
          </div>

          <Campo label="Firmado el">
            <Input type="date" value={f.firmado_at} onChange={(e) => set('firmado_at', e.target.value)} />
          </Campo>

          <Campo label="Notas">
            <Input value={f.notas} onChange={(e) => set('notas', e.target.value)} />
          </Campo>

          <p className="text-[11px] leading-snug text-muted-foreground">
            Lo que no se sabe se deja vacío. Un plazo en cero diría «hay que presentar el mismo
            día»; vacío dice «no lo sé», y el sistema lo va a pedir cuando lo necesite.
          </p>

          <Button size="lg" className="w-full" disabled={busy} onClick={guardar}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            {convenio ? 'Guardar cambios' : 'Cargar convenio'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function Campo({ label, ayuda, children }: {
  label: string; ayuda?: string; children: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
      {ayuda && <p className="text-[11px] leading-snug text-muted-foreground">{ayuda}</p>}
    </div>
  )
}
