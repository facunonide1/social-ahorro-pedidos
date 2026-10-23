'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Check, Clock, Loader2, RotateCcw, ShieldAlert, Ban } from 'lucide-react'
import { toast } from 'sonner'

import { formatARS } from '@/lib/utils/format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import type { ErrorConSeguimiento, ErrorQueVuelve } from '@/lib/canales/lectura'

type Plazo = {
  clave: string; nombre: string; dias_para_resolver: number | null
  siempre_arriba: boolean; tope_diario: number | null
}

/**
 * A.7 · LOS ERRORES CON SU SEGUIMIENTO HASTA EL CIERRE.
 *
 * ── LOS DOS BOTONES, Y POR QUÉ SON DOS ──────────────────────────────────────
 *
 * «Resolver» dice qué se hizo y genera tarea de control (regla de oro 5).
 * «No se puede» dice por qué no se puede y lo cierra igual, declarándolo.
 *
 * Un solo botón obligaría a elegir entre mentir («lo arreglé») y no cerrar
 * nunca. Los 23.319 productos sin costo no se arreglan desde esta pantalla, y
 * un error que depende de que SIFACO mande el costo tiene que poder cerrarse
 * diciendo exactamente eso.
 *
 * ── Y POR QUÉ LOS QUE VUELVEN VAN APARTE ────────────────────────────────────
 *
 * Porque un error que se cerró y reapareció no es un error nuevo: es un
 * proceso que no funciona. Mezclado con los demás se resuelve otra vez, y otra.
 * Arriba, con las veces que volvió y qué se hizo la última, se discute el
 * proceso en vez de volver a tapar el agujero.
 */
export function ErroresSeguimiento({ errores, vuelven, plazos }: {
  errores: ErrorConSeguimiento[] | null
  vuelven: ErrorQueVuelve[] | null
  plazos: Plazo[] | null
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState<{ e: ErrorConSeguimiento; modo: 'resolver' | 'no_se_puede' } | null>(null)
  const [texto, setTexto] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [filtro, setFiltro] = useState<'todos' | 'vencidos' | 'legal'>('todos')

  const plazoDe = useMemo(
    () => new Map((plazos ?? []).map((p) => [p.clave, p])),
    [plazos],
  )

  async function enviar() {
    if (!abierto) return
    setGuardando(true)
    try {
      const url = abierto.modo === 'resolver'
        ? '/api/canales/resolver'
        : '/api/canales/no-se-puede'
      const body = abierto.modo === 'resolver'
        ? { anomalia_id: abierto.e.id, que_se_hizo: texto }
        : { anomalia_id: abierto.e.id, motivo: texto }
      const r = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error ?? 'No se pudo cerrar.')
      toast.success(abierto.modo === 'resolver' ? 'Resuelto' : 'Declarado', {
        description: j.que_pasa_ahora ?? j.que_pasa ?? undefined, duration: 10_000,
      })
      setAbierto(null); setTexto('')
      router.refresh()
    } catch (e: any) {
      toast.error(e?.message ?? 'Falló.')
    } finally { setGuardando(false) }
  }

  if (errores === null) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="size-4" />
        <AlertDescription className="text-sm leading-snug">
          <b>No se pudieron leer los errores.</b> No significa que no haya: significa que la
          consulta falló y no se sabe.
        </AlertDescription>
      </Alert>
    )
  }

  const ahora = Date.now()
  const estaVencido = (e: ErrorConSeguimiento) =>
    e.vence_at !== null && new Date(e.vence_at).getTime() < ahora

  const vencidos = errores.filter(estaVencido)
  const conPlazo = errores.filter((e) => e.vence_at !== null)
  const legales = errores.filter((e) => e.detector === 'canal_legal_publicado')

  const lista = (
    filtro === 'vencidos' ? vencidos
      : filtro === 'legal' ? legales
        : errores
  ).slice(0, 300)

  const diasRestantes = (e: ErrorConSeguimiento) => {
    if (!e.vence_at) return null
    return Math.round((new Date(e.vence_at).getTime() - ahora) / 86_400_000)
  }

  return (
    <div className="space-y-5">
      {/* ── EL ESTADO DEL SEGUIMIENTO ────────────────────────────────── */}
      <div className="grid gap-x-4 gap-y-3 rounded-lg border p-4 sm:grid-cols-4">
        {[
          { t: 'abiertos', v: errores.length, d: 'sin cerrar ni declarar' },
          { t: 'con plazo corriendo', v: conPlazo.length, d: 'el resto espera turno en la cola del día' },
          { t: 'vencidos', v: vencidos.length, d: 'pasaron su plazo y siguen abiertos', rojo: true },
          { t: 'volvieron', v: vuelven?.length ?? null, d: 'se cerraron y reaparecieron' },
        ].map((x) => (
          <div key={x.t}>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{x.t}</p>
            <p className={`text-2xl font-semibold tabular-nums ${x.rojo && x.v ? 'text-destructive' : ''}`}>
              {x.v === null ? '—' : x.v.toLocaleString('es-AR')}
            </p>
            <p className="text-[11px] leading-snug text-muted-foreground">{x.d}</p>
          </div>
        ))}
      </div>

      {/* ── LOS PLAZOS DECLARADOS ────────────────────────────────────── */}
      {!!plazos?.length && (
        <section className="space-y-1.5 rounded-lg border border-dashed p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            El plazo de cada tipo
          </h3>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {plazos.map((p) => (
              <span key={p.clave}>
                {p.nombre}:{' '}
                <b className="tabular-nums">
                  {p.dias_para_resolver === null
                    ? 'sin plazo'
                    : p.dias_para_resolver === 0
                      ? 'el mismo día'
                      : `${p.dias_para_resolver} días`}
                </b>
                {p.siempre_arriba && (
                  <Badge variant="outline" className="ml-1 text-[10px]">siempre arriba</Badge>
                )}
              </span>
            ))}
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground">
            El plazo lo escribe la corrida cuando publica el hallazgo, no esta pantalla: si se
            calculara acá habría dos lugares diciendo cuándo vence y el que esté mal va a ser el
            que se mire.
          </p>
        </section>
      )}

      {/* ── LOS QUE VUELVEN, ARRIBA Y APARTE ─────────────────────────── */}
      {!!vuelven?.length && (
        <section className="space-y-2 rounded-lg border-2 border-amber-500/60 bg-amber-500/5 p-4">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <RotateCcw className="size-4" />
            {vuelven.length} errores que se cerraron y volvieron
          </h3>
          <p className="text-[11px] leading-snug">
            Un error que vuelve no es un error nuevo: <b>es un proceso que no funciona.</b>{' '}
            Resolverlo otra vez lo tapa hasta la próxima.
          </p>
          <div className="divide-y rounded-lg border bg-background">
            {vuelven.map((v) => (
              <div key={v.anomalia_id} className="px-3 py-2.5 text-xs">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <Badge variant="outline" className="text-[10px]">{v.nombre_detector}</Badge>
                  <b className="tabular-nums">volvió {v.veces} veces</b>
                </div>
                <p className="mt-1 leading-snug">{v.hecho}</p>
                {v.que_se_hizo_la_ultima_vez && (
                  <p className="mt-1 leading-snug text-muted-foreground">
                    La última vez se hizo: «{v.que_se_hizo_la_ultima_vez}»
                  </p>
                )}
                <p className="mt-1 leading-snug text-muted-foreground">{v.hecho_de_proceso}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── EL FILTRO ────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1.5">
        {([
          ['todos', `Todos (${errores.length})`],
          ['vencidos', `Vencidos (${vencidos.length})`],
          ['legal', `Condición legal (${legales.length})`],
        ] as const).map(([k, label]) => (
          <Button
            key={k} size="sm"
            variant={filtro === k ? 'default' : 'outline'}
            onClick={() => setFiltro(k)}
            className="h-7 text-xs"
          >
            {label}
          </Button>
        ))}
      </div>

      {/* ── LA LISTA ─────────────────────────────────────────────────── */}
      {!lista.length ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No hay errores con ese filtro. <b>Este cero es de verdad:</b> se miró y no hay.
        </p>
      ) : (
        <div className="divide-y rounded-lg border">
          {lista.map((e) => {
            const dias = diasRestantes(e)
            const vencido = estaVencido(e)
            const p = plazoDe.get(e.detector)
            return (
              <div key={e.id} className="space-y-1.5 px-3 py-3 text-xs">
                <div className="flex flex-wrap items-center gap-1.5">
                  {e.detector === 'canal_legal_publicado' && (
                    <ShieldAlert className="size-3.5 shrink-0 text-destructive" />
                  )}
                  <Badge variant="outline" className="text-[10px]">
                    {p?.nombre ?? e.detector}
                  </Badge>
                  {e.estado === 'reaparecio' && (
                    <Badge variant="secondary" className="text-[10px]">
                      reapareció {e.veces_reaparecio}×
                    </Badge>
                  )}
                  {e.plata_en_juego !== null && (
                    <span className="font-semibold tabular-nums">
                      {formatARS(e.plata_en_juego, 0)}
                    </span>
                  )}
                  {e.vence_at === null ? (
                    <span className="text-muted-foreground">sin plazo asignado todavía</span>
                  ) : vencido ? (
                    <Badge variant="destructive" className="text-[10px]">
                      vencido hace {Math.abs(dias ?? 0)} días
                    </Badge>
                  ) : (
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Clock className="size-3" />
                      {dias === 0 ? 'vence hoy' : `${dias} días`}
                    </span>
                  )}
                </div>

                <p className="leading-snug">{e.hecho}</p>

                {e.como_se_calculo && (
                  <p className="leading-snug text-muted-foreground">{e.como_se_calculo}</p>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  <Button
                    size="sm" className="h-7 text-xs"
                    onClick={() => { setAbierto({ e, modo: 'resolver' }); setTexto('') }}
                  >
                    <Check className="mr-1 size-3" />
                    Resolver
                  </Button>
                  <Button
                    size="sm" variant="outline" className="h-7 text-xs"
                    onClick={() => { setAbierto({ e, modo: 'no_se_puede' }); setTexto('') }}
                  >
                    <Ban className="mr-1 size-3" />
                    No se puede
                  </Button>
                  {e.responsable_user_id === null && (
                    <span className="text-[11px] text-muted-foreground">sin responsable</span>
                  )}
                </div>
              </div>
            )
          })}
          {errores.length > 300 && filtro === 'todos' && (
            <p className="px-3 py-2 text-[11px] text-muted-foreground">
              Se muestran los primeros 300 de {errores.length.toLocaleString('es-AR')}, ordenados
              por vencimiento y después por plata. <b>No es que los demás no existan:</b> es que
              una lista de 2.977 renglones no se revisa.
            </p>
          )}
        </div>
      )}

      {/* ── EL DIÁLOGO ───────────────────────────────────────────────── */}
      <Dialog open={!!abierto} onOpenChange={(o) => !o && setAbierto(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {abierto?.modo === 'resolver' ? 'Qué se hizo' : 'Por qué no se puede'}
            </DialogTitle>
            <DialogDescription className="text-xs leading-snug">
              {abierto?.modo === 'resolver'
                ? 'Queda guardado con tu nombre y genera una tarea de control: alguien tiene que verificar que efectivamente se hizo (regla de oro 5).'
                : 'El error se cierra declarando que no se puede resolver desde acá. No se borra: queda con el motivo, y si vuelve a aparecer se va a ver que ya se había declarado.'}
            </DialogDescription>
          </DialogHeader>
          {abierto && (
            <>
              <p className="rounded border bg-muted/40 p-2.5 text-xs leading-snug">
                {abierto.e.hecho}
              </p>
              <Textarea
                value={texto} onChange={(ev) => setTexto(ev.target.value)}
                rows={3} className="text-sm"
                placeholder={abierto.modo === 'resolver'
                  ? 'Lo despubliqué de PedidosYa desde el portal'
                  : 'El costo lo tiene que mandar SIFACO: no se puede cargar desde acá'}
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setAbierto(null)}>
                  Cancelar
                </Button>
                <Button size="sm" onClick={enviar} disabled={guardando || !texto.trim()}>
                  {guardando && <Loader2 className="mr-1 size-3 animate-spin" />}
                  {abierto.modo === 'resolver' ? 'Cerrar como resuelto' : 'Declarar que no se puede'}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
