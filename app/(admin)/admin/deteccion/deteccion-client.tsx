'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Loader2, EyeOff, Info, Gauge } from 'lucide-react'
import { toast } from 'sonner'

import { formatARS } from '@/lib/utils/format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import type {
  Hallazgo, EstadoDetector, Marcador, Motivo,
} from '@/lib/deteccion/lectura'

const FAMILIAS = [
  { clave: null, nombre: 'Todo' },
  { clave: 'no_cuadra', nombre: 'Lo que no cuadra' },
  { clave: 'cambio', nombre: 'Lo que cambió' },
  { clave: 'catalogo', nombre: 'El catálogo' },
]

export function DeteccionClient({ lista, estados, marcadores, motivos, esperan, familia, larga }: {
  lista: Hallazgo[] | null
  estados: EstadoDetector[] | null
  marcadores: Marcador[] | null
  motivos: Motivo[] | null
  esperan: number | null
  familia: string | null
  larga: boolean
}) {
  const router = useRouter()
  const [descartando, setDescartando] = useState<Hallazgo | null>(null)
  const [motivo, setMotivo] = useState<string | null>(null)
  const [nota, setNota] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [verMarcador, setVerMarcador] = useState(false)

  const noCorren = useMemo(
    () => (estados ?? []).filter((e) => !e.puede_correr), [estados])

  async function descartar() {
    if (!descartando || !motivo) return
    setGuardando(true)
    try {
      const r = await fetch('/api/deteccion/descartar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anomalia_id: descartando.id, motivo, nota }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error ?? 'No se pudo descartar.')
      toast.success(j.motivo, { description: j.que_pasa_ahora, duration: 8000 })
      setDescartando(null); setMotivo(null); setNota('')
      router.refresh()
    } catch (e: any) {
      toast.error(e?.message ?? 'Falló.')
    } finally { setGuardando(false) }
  }

  // ── LA LECCIÓN DE LA v0.99 ───────────────────────────────────────────────
  //
  // `null` no se trata como lista vacía. Una pantalla que dice «no hay nada»
  // cuando en realidad no pudo mirar es peor que una pantalla en blanco.
  if (lista === null) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="size-4" />
        <AlertDescription className="text-sm leading-snug">
          <b>No se pudo leer lo que el sistema encontró.</b> Esto no significa que no haya
          nada: significa que la consulta falló y no se sabe. El detalle quedó en el log del
          servidor.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-5">
      {/* ── D.2 y D.4 · EL ENCABEZADO DICE DÓNDE ESTÁ PARADO ────────────── */}
      <section className="rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-3xl font-semibold tabular-nums">{lista.length}</span>
          <span className="text-sm text-muted-foreground">
            {larga ? 'en la lista larga' : 'arriba, ordenados por plata'}
          </span>
        </div>
        <p className="mt-2 text-xs leading-snug text-muted-foreground">
          {larga ? (
            <>
              Esto es todo lo que los detectores encontraron, con lo que no se puede costear
              incluido. Lo de arriba es lo que el sistema eligió para interrumpir.
            </>
          ) : (
            <>
              Los detectores encuentran mucho más que esto. Cada uno publica a lo sumo sus
              cinco peores por día, y entre todos no pasan el presupuesto de interrupción.{' '}
              {esperan === null ? (
                <b>No se pudo contar cuántos esperan.</b>
              ) : (
                <>
                  Hay <b>{esperan.toLocaleString('es-AR')}</b> esperando en la lista larga: no se
                  pierden, mañana suben si lo de arriba se resolvió.
                </>
              )}
            </>
          )}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {FAMILIAS.map((f) => (
            <Button key={f.nombre} size="sm" variant={familia === f.clave ? 'default' : 'outline'}
              asChild>
              <Link href={`/admin/deteccion?${new URLSearchParams({
                ...(f.clave ? { familia: f.clave } : {}), ...(larga ? { larga: '1' } : {}),
              })}`}>{f.nombre}</Link>
            </Button>
          ))}
          <Button size="sm" variant={larga ? 'default' : 'outline'} asChild>
            <Link href={`/admin/deteccion?${new URLSearchParams({
              ...(familia ? { familia } : {}), ...(larga ? {} : { larga: '1' }),
            })}`}>{larga ? 'Volver a lo de arriba' : 'Ver la lista larga'}</Link>
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5"
            onClick={() => setVerMarcador(true)}>
            <Gauge className="size-3.5" /> El marcador de cada detector
          </Button>
        </div>
      </section>

      {/* ── C.7 · LO QUE NO PUEDE CORRER, Y POR QUÉ ─────────────────────── */}
      {!!noCorren.length && (
        <section className="rounded-lg border border-dashed bg-muted/30 p-4">
          <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Info className="size-3.5" /> {noCorren.length} detectores no pueden correr todavía
          </h2>
          <p className="mt-1.5 text-xs leading-snug text-muted-foreground">
            No reportan cero: cero significaría «lo miré y no hay». Les falta historia, y eso
            también es información.
          </p>
          <ul className="mt-2 space-y-1.5">
            {noCorren.map((e) => (
              <li key={e.clave} className="text-xs leading-snug">
                <b>{e.nombre}:</b> {e.por_que_no}.{' '}
                <span className="text-muted-foreground">Necesita {e.historia_minima}.</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── LOS HALLAZGOS ──────────────────────────────────────────────── */}
      {!lista.length ? (
        <Alert>
          <AlertDescription className="text-sm leading-snug">
            <b>No hay nada arriba.</b> Esto sí es un cero de verdad: los detectores corrieron y
            no encontraron nada que justifique interrumpir a nadie.
          </AlertDescription>
        </Alert>
      ) : (
        <ul className="space-y-3">
          {lista.map((h) => (
            <li key={h.id} className="rounded-lg border bg-card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="text-[10px]">{h.nombre_detector}</Badge>
                {h.sucursal && <Badge variant="secondary" className="text-[10px]">{h.sucursal}</Badge>}
                {h.veces_reaparecio > 0 && (
                  <Badge variant="outline" className="text-[10px]">
                    volvió {h.veces_reaparecio} {h.veces_reaparecio === 1 ? 'vez' : 'veces'}
                  </Badge>
                )}
                {h.publicado_at === null && (
                  <Badge variant="outline" className="text-[10px]">esperando</Badge>
                )}
                <span className="ml-auto text-lg font-semibold tabular-nums">
                  {h.plata === null
                    ? <span className="text-sm font-normal text-muted-foreground">sin plata estimada</span>
                    : formatARS(h.plata)}
                </span>
              </div>

              <p className="mt-2 text-sm leading-snug">{h.hecho}</p>

              {/* D.1 · la plata nunca va sola: va con de dónde sale. */}
              {h.como_se_calculo && (
                <p className="mt-1.5 text-xs leading-snug text-muted-foreground">
                  <b>De dónde sale:</b> {h.como_se_calculo}
                </p>
              )}

              {/* La otra mitad de la honestidad. */}
              <p className="mt-1.5 text-xs leading-snug text-muted-foreground">
                <b>Lo que esto NO dice:</b> {h.que_no_dice}
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                {h.aviso_href && (
                  <Button size="sm" variant="outline" asChild>
                    <Link href={h.aviso_href}>Ver</Link>
                  </Button>
                )}
                <Button size="sm" variant="ghost" className="gap-1.5"
                  onClick={() => { setDescartando(h); setMotivo(null); setNota('') }}>
                  <EyeOff className="size-3.5" /> Descartar
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* ── D.5 · DESCARTAR CON UN MOTIVO ──────────────────────────────── */}
      <Dialog open={!!descartando} onOpenChange={(o) => !o && setDescartando(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-left leading-tight">¿Por qué se descarta?</DialogTitle>
            <DialogDescription className="text-left text-xs leading-snug">
              El motivo no es un trámite: con tres descartes del mismo motivo, el detector deja
              de reportar eso. Sin motivo no puede aprender nada.
            </DialogDescription>
          </DialogHeader>

          {motivos === null ? (
            <Alert variant="destructive">
              <AlertDescription className="text-sm">
                No se pudieron leer los motivos, así que no se puede descartar: un descarte sin
                motivo del catálogo no le enseña nada al detector.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <div className="space-y-2">
                {motivos.map((m) => (
                  <label key={m.clave}
                    className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 ${
                      motivo === m.clave ? 'border-primary bg-primary/5' : ''}`}>
                    <input type="radio" name="motivo" className="mt-1 size-4"
                      checked={motivo === m.clave} onChange={() => setMotivo(m.clave)} />
                    <span className="text-sm leading-snug">
                      <span className="font-medium">{m.nombre}</span>
                      {m.silencia && (
                        <Badge variant="outline" className="ml-1.5 text-[10px]">calla al detector</Badge>
                      )}
                      <span className="mt-0.5 block text-xs text-muted-foreground">{m.ayuda}</span>
                    </span>
                  </label>
                ))}
              </div>

              <Textarea value={nota} onChange={(e) => setNota(e.target.value)}
                placeholder="Si querés, agregá una línea. Queda guardada con el descarte."
                className="text-base" rows={2} />

              <Button size="lg" className="w-full" disabled={!motivo || guardando}
                onClick={descartar}>
                {guardando && <Loader2 className="mr-1.5 size-4 animate-spin" />}
                Descartar
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── D.7 · EL MARCADOR ──────────────────────────────────────────── */}
      <Dialog open={verMarcador} onOpenChange={setVerMarcador}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-left leading-tight">Cuántas veces acertó cada detector</DialogTitle>
            <DialogDescription className="text-left text-xs leading-snug">
              Lo que nadie miró no cuenta como acierto. Un detector que no acierta ninguna de
              las veces que se pudo medir se apaga, y queda dicho.
            </DialogDescription>
          </DialogHeader>

          {marcadores === null ? (
            <Alert variant="destructive">
              <AlertDescription className="text-sm">No se pudo leer el marcador.</AlertDescription>
            </Alert>
          ) : (
            <ul className="space-y-2.5">
              {marcadores.map((m) => (
                <li key={m.detector} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-sm font-medium">{m.nombre}</span>
                    {m.pct_acierto !== null && m.se_puede_juzgar && (
                      <Badge variant="outline" className="text-[10px]">{m.pct_acierto}% de acierto</Badge>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                      {m.abiertos.toLocaleString('es-AR')} abiertos
                      {m.plata_abierta > 0 && ` · ${formatARS(m.plata_abierta)}`}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-snug text-muted-foreground">{m.veredicto}</p>
                  {m.volvieron > 0 && (
                    <p className="mt-1 text-xs leading-snug">
                      <b>{m.volvieron}</b> se habían descartado y después volvieron a pasar.
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
