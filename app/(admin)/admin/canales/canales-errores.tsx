'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ShieldAlert, AlertTriangle, Loader2, Check, Scale } from 'lucide-react'
import { toast } from 'sonner'

import { formatARS } from '@/lib/utils/format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import type { ErrorDeCanal } from '@/lib/canales/lectura'

type Conflicto = {
  en_conflicto: number
  publicados_si_se_mira_el_booleano: number
  publicados_si_se_mira_la_condicion: number
  publicados_con_el_criterio_conservador: number
  que_criterio_se_usa: string
  por_que_no_se_arregla: string
} | null

/**
 * B · LOS ERRORES DEL CATÁLOGO, CON SU ACCIÓN.
 *
 * ── POR QUÉ LO LEGAL VA PRIMERO Y SIN TOPE ──────────────────────────────────
 *
 * El resto de los errores respeta el presupuesto de interrupción de la v1.3:
 * los cinco peores de cada tipo por día. Lo legal no, y no por gravedad
 * genérica: la regla de oro 9 está por encima del presupuesto. Un producto
 * con receta publicado no puede esperar a que haya lugar en la lista de hoy.
 *
 * La corrida lo informa aparte —«20 publicados por encima del presupuesto
 * porque son legales»— para que la excepción quede a la vista en vez de
 * disolverse en el total.
 */
export function CanalesErrores({ errores, conflicto }: {
  errores: ErrorDeCanal[] | null
  conflicto: Conflicto
}) {
  const router = useRouter()
  const [resolviendo, setResolviendo] = useState<ErrorDeCanal | null>(null)
  const [queSeHizo, setQueSeHizo] = useState('')
  const [guardando, setGuardando] = useState(false)

  async function resolver() {
    if (!resolviendo) return
    setGuardando(true)
    try {
      const r = await fetch('/api/canales/resolver', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anomalia_id: resolviendo.id, que_se_hizo: queSeHizo }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error ?? 'No se pudo cerrar.')
      toast.success('Resuelto', { description: j.que_pasa_ahora, duration: 10000 })
      setResolviendo(null); setQueSeHizo('')
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
          <b>No se pudieron leer los errores del catálogo.</b> No significa que no haya:
          significa que la consulta falló y no se sabe.
        </AlertDescription>
      </Alert>
    )
  }

  const legales = errores.filter((e) => e.detector === 'canal_legal_publicado')
  const resto = errores.filter((e) => e.detector !== 'canal_legal_publicado')

  return (
    <div className="space-y-5">
      {/* ── B.1 · ARRIBA DE TODO, EN ROJO ──────────────────────────────── */}
      {!!legales.length && (
        <section className="space-y-3 rounded-lg border-2 border-destructive bg-destructive/5 p-4">
          <div className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 size-5 shrink-0 text-destructive" />
            <div>
              <h2 className="text-sm font-semibold text-destructive">
                {legales.length} productos de condición legal publicados en un canal abierto
              </h2>
              <p className="mt-0.5 text-xs leading-snug">
                Es la regla de oro 9 y no es una decisión comercial. Van arriba sin tope y sin
                plata al lado: el riesgo de una sanción no tiene número, y poner uno inventado
                sería peor que no poner ninguno.
              </p>
            </div>
          </div>

          {/* El hallazgo que decide el número, dicho. */}
          {conflicto && conflicto.en_conflicto > 0 && (
            <div className="rounded-lg border bg-background p-3">
              <p className="flex items-start gap-1.5 text-xs leading-snug">
                <Scale className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  <b>Los dos campos de SIFACO que dicen si un producto necesita receta no
                  coinciden en {conflicto.en_conflicto.toLocaleString('es-AR')} productos.</b>{' '}
                  Mirando uno hay {conflicto.publicados_si_se_mira_el_booleano} publicados;
                  mirando el otro, {conflicto.publicados_si_se_mira_la_condicion}. Acá se usan{' '}
                  {conflicto.publicados_con_el_criterio_conservador}: {conflicto.que_criterio_se_usa}
                </span>
              </p>
              <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
                No se arregla desde acá: {conflicto.por_que_no_se_arregla}
              </p>
            </div>
          )}

          <ul className="space-y-2">
            {legales.map((e) => (
              <li key={e.id} className="rounded-lg border bg-background p-3">
                <p className="text-sm leading-snug">{e.hecho}</p>
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                  <b>Lo que esto NO dice:</b> {e.que_no_dice}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(e as any).evidencia?.permalink && (
                    <Button size="sm" variant="outline" asChild>
                      <a href={(e as any).evidencia.permalink} target="_blank" rel="noreferrer">
                        Ver en la tienda
                      </a>
                    </Button>
                  )}
                  <Button size="sm" variant="destructive"
                    onClick={() => { setResolviendo(e); setQueSeHizo('Lo despubliqué en el canal.') }}>
                    Lo despubliqué
                  </Button>
                </div>
              </li>
            ))}
          </ul>

          <p className="text-[11px] leading-snug text-muted-foreground">
            <b>NORA no despublica.</b> El cambio se hace en el canal y después se marca acá —
            y marcarlo genera una tarea de control para que alguien verifique que quedó hecho
            afuera. Es la regla de oro 5.
          </p>
        </section>
      )}

      {/* ── B.2 a B.6 ──────────────────────────────────────────────────── */}
      {!resto.length ? (
        <Alert>
          <AlertDescription className="text-sm leading-snug">
            <b>No hay otros errores del catálogo arriba.</b> Los detectores corrieron: lo que no
            está acá está en la lista larga, esperando lugar.
          </AlertDescription>
        </Alert>
      ) : (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Los otros errores, ordenados por plata
          </h2>
          <ul className="space-y-2">
            {resto.map((e) => (
              <li key={e.id} className="rounded-lg border bg-card p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">{e.nombre_detector}</Badge>
                  {e.sucursal && <Badge variant="secondary" className="text-[10px]">{e.sucursal}</Badge>}
                  {e.publicado_at === null && (
                    <Badge variant="outline" className="text-[10px]">esperando lugar</Badge>
                  )}
                  <span className="ml-auto text-base font-semibold tabular-nums">
                    {e.plata === null
                      ? <span className="text-xs font-normal text-muted-foreground">sin plata estimada</span>
                      : formatARS(e.plata)}
                  </span>
                </div>
                <p className="mt-1.5 text-sm leading-snug">{e.hecho}</p>
                {e.como_se_calculo && (
                  <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                    <b>De dónde sale:</b> {e.como_se_calculo}
                  </p>
                )}
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                  <b>Lo que esto NO dice:</b> {e.que_no_dice}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {e.aviso_href && (
                    <Button size="sm" variant="outline" asChild>
                      <Link href={e.aviso_href}>Ver</Link>
                    </Button>
                  )}
                  <Button size="sm" variant="ghost"
                    onClick={() => { setResolviendo(e); setQueSeHizo('') }}>
                    Lo resolví
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── I.5 · QUÉ SE HIZO ──────────────────────────────────────────── */}
      <Dialog open={!!resolviendo} onOpenChange={(o) => !o && setResolviendo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-left leading-tight">¿Qué hiciste?</DialogTitle>
            <DialogDescription className="text-left text-xs leading-snug">
              No alcanza con «resuelto». Lo que escribas acá es lo único que después va a decir
              si el problema volvió por lo mismo — y va a quedar en la tarea de control de quien
              tenga que verificarlo.
            </DialogDescription>
          </DialogHeader>
          <Textarea value={queSeHizo} onChange={(e) => setQueSeHizo(e.target.value)}
            rows={3} className="text-base"
            placeholder="Por ejemplo: lo despubliqué en la tienda y le saqué el stock." />
          <Button size="lg" className="w-full gap-1.5"
            disabled={guardando || !queSeHizo.trim()} onClick={resolver}>
            {guardando ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            Cerrar y generar la tarea de control
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  )
}
