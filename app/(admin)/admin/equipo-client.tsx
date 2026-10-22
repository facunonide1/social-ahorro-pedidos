'use client'

import Link from 'next/link'
import { useState } from 'react'
import * as Iconos from 'lucide-react'
import { ArrowRight, CircleSlash, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { formatARS } from '@/lib/utils/format'
import { NIVEL_TEXTO, type Nivel } from '@/lib/agentes/elenco'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'

type Lectura = {
  agente: { id: string; nombre: string; queHace: string; alcance: string; deDondeLee: string; icono: string }
  encendido: boolean
  frase: string | null
  motivoApagado: string | null
  queLoEnciende: string | null
  nivel: Nivel
  href: string
  marcador: { propuestas: number; aceptadas: number; acertadas: number } | null
}

type Decision = {
  clave: string; agente: string; titulo: string; que_pasa: string
  el_calculo: string; costo_por_dia: number | null; por_que_no_se_sabe: string | null; href: string
}

function Icono({ nombre, className }: { nombre: string; className?: string }) {
  const C = (Iconos as any)[nombre] ?? Iconos.Circle
  return <C className={className} />
}

export function EquipoClient({ equipo, decisiones, alcanceNombre, esCadena }: {
  equipo: Lectura[]; decisiones: Decision[]; alcanceNombre: string; esCadena: boolean
}) {
  const [abierta, setAbierta] = useState<Decision | null>(null)
  const [decidiendo, setDecidiendo] = useState(false)
  const [resueltas, setResueltas] = useState<string[]>([])

  const pendientes = decisiones.filter((d) => !resueltas.includes(d.clave))
  const conCosto = pendientes.filter((d) => d.costo_por_dia != null)
  const sinCosto = pendientes.filter((d) => d.costo_por_dia == null)
  const porDia = conCosto.reduce((a, d) => a + Number(d.costo_por_dia), 0)

  const encendidos = equipo.filter((a) => a.encendido)
  const apagados = equipo.filter((a) => !a.encendido)

  /** C.5 · lo que se decide queda en la bitácora: es lo que llena el marcador. */
  async function decidir(d: Decision, que: 'aceptada' | 'rechazada') {
    setDecidiendo(true)
    try {
      const r = await fetch('/api/agentes/decidir', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clave: d.clave, agente: d.agente, propuso: d.titulo, por_que: d.el_calculo,
          costo_por_dia: d.costo_por_dia, estado: que,
        }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error ?? 'No se pudo guardar.')
      setResueltas((p) => [...p, d.clave])
      setAbierta(null)
      toast.success(que === 'aceptada' ? 'Anotada como aceptada.' : 'Anotada como rechazada.', {
        description: 'Queda en la bitácora con tu nombre.',
        // D.5 · deshacer visible unos segundos.
        action: {
          label: 'Deshacer',
          onClick: async () => {
            await fetch('/api/agentes/decidir', {
              method: 'DELETE', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ clave: d.clave }),
            })
            setResueltas((p) => p.filter((c) => c !== d.clave))
          },
        },
      })
    } catch (e: any) {
      toast.error(e?.message ?? 'Falló.')
    } finally { setDecidiendo(false) }
  }

  return (
    <div className="space-y-6">
      {/* ── C.4 · LO QUE CUESTA NO DECIDIR ──────────────────────────────── */}
      {pendientes.length > 0 && (
        <section className="rounded-lg border bg-card p-4">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-3xl font-semibold tabular-nums">{formatARS(porDia * 7)}</span>
            <span className="text-sm text-muted-foreground">por semana es lo que cuesta no decidir</span>
          </div>
          <p className="mt-1 text-xs leading-snug text-muted-foreground">
            {conCosto.length} de las {pendientes.length} decisiones tienen un costo que se puede
            calcular. {sinCosto.length > 0 && (
              <>Las otras {sinCosto.length} <b>no suman nada acá</b>: no es que no cuesten, es que no
              se puede saber cuánto, y cada una dice por qué.</>
            )}
          </p>
        </section>
      )}

      {/* ── C.1 · LA DECISIÓN, DE A UNA ─────────────────────────────────── */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Lo que necesita tu firma
        </h2>
        {!pendientes.length ? (
          <div className="rounded-lg border border-dashed p-6 text-center">
            <p className="text-sm font-medium">Listo por ahora.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              No queda nada esperando una decisión tuya. Saber que terminaste es la mitad del valor.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {pendientes
              .slice()
              .sort((a, b) => Number(b.costo_por_dia ?? -1) - Number(a.costo_por_dia ?? -1))
              .map((d) => (
                <button key={d.clave} onClick={() => setAbierta(d)}
                  className="flex w-full flex-wrap items-center gap-3 rounded-lg border bg-card p-3 text-left hover:border-primary/40">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{d.titulo}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{d.que_pasa}</div>
                  </div>
                  {d.costo_por_dia != null ? (
                    <div className="text-right">
                      <div className="font-medium tabular-nums text-destructive">
                        {formatARS(Number(d.costo_por_dia))}
                      </div>
                      <div className="text-[10px] text-muted-foreground">por día</div>
                    </div>
                  ) : (
                    <Badge variant="outline" className="text-[10px]">sin costo calculable</Badge>
                  )}
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                </button>
              ))}
          </div>
        )}
      </section>

      {/* ── A · EL EQUIPO ───────────────────────────────────────────────── */}
      <section className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            El equipo {esCadena ? 'de la cadena' : `de ${alcanceNombre}`}
          </h2>
          <p className="text-xs text-muted-foreground">
            {esCadena
              ? 'Los que trabajan para las cuatro sucursales. Eligiendo una sucursal aparecen otros.'
              : 'Los que trabajan acá. Abasto y Tesoro son de cadena y se ven eligiendo «todas».'}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {encendidos.map((a) => (
            <Link key={a.agente.id} href={a.href}
              className="rounded-lg border bg-card p-4 hover:border-primary/40">
              <div className="flex items-center gap-2">
                <Icono nombre={a.agente.icono} className="size-4 text-muted-foreground" />
                <span className="font-medium">{a.agente.nombre}</span>
                <Badge variant="outline" className="text-[10px]">
                  {NIVEL_TEXTO[a.nivel].t}
                </Badge>
                <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground">
                  {a.agente.alcance === 'cadena' ? 'cadena' : alcanceNombre}
                </span>
              </div>
              <p className="mt-2 text-sm leading-snug">{a.frase}</p>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {a.marcador
                  ? `${a.marcador.propuestas} propuestas · ${a.marcador.aceptadas} aceptadas · ${a.marcador.acertadas} dieron el resultado calculado`
                  : 'Todavía sin antecedentes: no propuso nada que se haya decidido.'}
              </p>
            </Link>
          ))}
        </div>

        {/* ── A.5 · LOS APAGADOS, CON EL MOTIVO ─────────────────────────── */}
        {apagados.length > 0 && (
          <div className="space-y-2 pt-2">
            {apagados.map((a) => (
              <div key={a.agente.id} className="rounded-lg border border-dashed bg-muted/30 p-3">
                <div className="flex items-center gap-2 text-sm">
                  <CircleSlash className="size-4 text-muted-foreground" />
                  <span className="font-medium text-muted-foreground">{a.agente.nombre}</span>
                  <span className="text-xs text-muted-foreground">· {a.agente.queHace}</span>
                  <Badge variant="outline" className="ml-auto text-[10px]">apagado</Badge>
                </div>
                <p className="mt-1 text-xs leading-snug text-muted-foreground">
                  <b>Por qué:</b> {a.motivoApagado}.{' '}
                  <b>Qué lo enciende:</b> {a.queLoEnciende}.
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── D.4 · EL PANEL LATERAL: se decide sin salir de acá ──────────── */}
      <Sheet open={!!abierta} onOpenChange={(v) => !v && setAbierta(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {abierta && (
            <>
              <SheetHeader><SheetTitle>{abierta.titulo}</SheetTitle></SheetHeader>
              <div className="mt-4 space-y-4 text-sm">
                <p>{abierta.que_pasa}</p>

                <div className="rounded-lg border bg-muted/30 p-3">
                  <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    La cuenta
                  </div>
                  <p className="text-xs leading-snug">{abierta.el_calculo}</p>
                </div>

                {abierta.costo_por_dia != null ? (
                  <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                    <div className="text-lg font-semibold tabular-nums">
                      {formatARS(Number(abierta.costo_por_dia))} por día
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatARS(Number(abierta.costo_por_dia) * 7)} por semana que esto siga así.
                    </div>
                  </div>
                ) : (
                  <Alert>
                    <AlertDescription className="text-xs leading-snug">
                      <b>No se puede calcular cuánto cuesta esperar.</b> {abierta.por_que_no_se_sabe}
                    </AlertDescription>
                  </Alert>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={decidiendo} onClick={() => decidir(abierta, 'aceptada')}>
                    {decidiendo ? <Loader2 className="size-4 animate-spin" /> : null} Me hago cargo
                  </Button>
                  <Button size="sm" variant="outline" disabled={decidiendo}
                    onClick={() => decidir(abierta, 'rechazada')}>
                    Ahora no
                  </Button>
                  <Button size="sm" variant="ghost" asChild>
                    <Link href={abierta.href}>Ver el detalle →</Link>
                  </Button>
                </div>
                <p className="text-[11px] leading-snug text-muted-foreground">
                  Lo que elijas queda en la bitácora con tu nombre y la hora. Eso es lo que después
                  permite decir si el agente acierta: hoy el marcador está vacío porque nadie decidió
                  nada todavía.
                </p>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
