'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, CheckCircle2, Clock, HelpCircle, ShieldAlert } from 'lucide-react'

import { formatARS } from '@/lib/utils/format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { Espera, BandejaResumen } from '@/lib/direccion/lectura'

const FUENTES: Record<string, string> = {
  decision: 'decisión',
  hallazgo: 'hallazgo',
  error_de_canal: 'error de catálogo',
  tarea: 'tarea vencida',
  firma: 'firma pendiente',
  debito: 'débito',
}

/**
 * E · LA BANDEJA, CON SUS TRES FILTROS Y SUS DOS GRUPOS.
 *
 * ── E.2 · POR QUÉ LO QUE NO SE PUEDE COSTEAR VA ABAJO Y SEPARADO ────────────
 *
 * Porque no es «cero plata»: es «no se sabe cuánta». Mezclado en la misma
 * lista ordenada por plata, todo lo que no tiene número cae al fondo y se lee
 * como «lo más barato». Son 34 de 75 renglones — las ocho tareas vencidas no
 * tienen plata asociada y algunos hallazgos no pudieron valuarse.
 *
 * ── Y POR QUÉ EL FILTRO «LO MÍO» PUEDE DAR CERO ─────────────────────────────
 *
 * Porque hoy ningún renglón tiene responsable asignado. El filtro no se
 * esconde por eso: muestra cero y dice que el problema es que nadie es dueño
 * de nada, que es información y no un error de la pantalla.
 */
export function BandejaClient({ items, resumen, sucursalActiva }: {
  items: Espera[] | null
  resumen: BandejaResumen | null
  sucursalActiva: string | null
}) {
  const [quien, setQuien] = useState<'todos' | 'mio' | 'sucursal'>('todos')
  const [fuente, setFuente] = useState<string | null>(null)

  const filtrados = useMemo(() => {
    let f = items ?? []
    if (quien === 'mio') f = f.filter((x) => x.mio)
    if (quien === 'sucursal' && sucursalActiva) {
      f = f.filter((x) => x.sucursal_id === sucursalActiva)
    }
    if (fuente) f = f.filter((x) => x.fuente === fuente)
    return f
  }, [items, quien, fuente, sucursalActiva])

  const conPlata = filtrados.filter((x) => x.se_puede_costear)
  const sinPlata = filtrados.filter((x) => !x.se_puede_costear)

  if (items === null || resumen === null) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-sm leading-snug text-muted-foreground">
        <b>No se pudo leer la bandeja.</b> La consulta falló: no significa que no haya nada
        esperando.
      </p>
    )
  }

  // E.5 · EL FINAL. Cuando no queda nada, se dice.
  if (resumen.vacia) {
    return (
      <div className="space-y-2 rounded-lg border p-8 text-center">
        <CheckCircle2 className="mx-auto size-8 text-emerald-600 dark:text-emerald-500" />
        <p className="text-base font-medium">No queda nada esperando.</p>
        <p className="mx-auto max-w-md text-xs leading-snug text-muted-foreground">
          El trabajo del día terminó. <b>Este cero es de verdad:</b> se miraron las seis fuentes
          —decisiones, hallazgos, errores de catálogo, tareas vencidas, firmas y débitos— y no hay.
          {resumen.esperando_turno > 0 && (
            <>
              {' '}
              Hay {resumen.esperando_turno.toLocaleString('es-AR')} hallazgos en cola que van a
              entrar de a poco: el tope diario de cada detector los reparte en el tiempo.
            </>
          )}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* ── E.4 · EL COSTO DE NO DECIDIR ─────────────────────────────── */}
      <div className="grid gap-x-4 gap-y-3 rounded-lg border p-4 sm:grid-cols-4">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">esperando</p>
          <p className="text-2xl font-semibold tabular-nums">
            {resumen.cuantos.toLocaleString('es-AR')}
          </p>
          <p className="text-[11px] leading-snug text-muted-foreground">
            renglones en seis fuentes
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            plata en juego
          </p>
          <p className="text-2xl font-semibold tabular-nums">
            {formatARS(resumen.plata_total, 0)}
          </p>
          <p className="text-[11px] leading-snug text-muted-foreground">
            un total, de {resumen.se_pueden_costear} renglones
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            cuesta por día
          </p>
          <p className="text-2xl font-semibold tabular-nums text-destructive">
            {formatARS(resumen.costo_por_dia, 0)}
          </p>
          <p className="text-[11px] leading-snug text-muted-foreground">
            un caudal, de las decisiones
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            sin poder costear
          </p>
          <p className="text-2xl font-semibold tabular-nums">
            {resumen.no_se_pueden_costear.toLocaleString('es-AR')}
          </p>
          <p className="text-[11px] leading-snug text-muted-foreground">
            abajo y separados
          </p>
        </div>
        <p className="text-[11px] leading-snug text-muted-foreground sm:col-span-4">
          <b>Las dos columnas de plata no se suman:</b>{' '}
          {resumen.por_que_hay_dos_columnas_de_plata}
        </p>
      </div>

      {/* ── E.6 · EL PRESUPUESTO DE INTERRUPCIÓN ─────────────────────── */}
      {resumen.esperando_turno > 0 && (
        <p className="flex gap-1.5 rounded-lg border border-dashed p-3 text-[11px] leading-snug text-muted-foreground">
          <Clock className="mt-0.5 size-3.5 shrink-0" />
          <span>
            <b>
              Hay {resumen.esperando_turno.toLocaleString('es-AR')} hallazgos más esperando turno.
            </b>{' '}
            {resumen.como_funciona_el_presupuesto}
          </span>
        </p>
      )}

      {/* ── E.3 · LOS FILTROS ────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-1.5">
        {([
          ['todos', `Todos (${items.length})`],
          ['mio', `Lo mío (${resumen.mios})`],
          ...(sucursalActiva
            ? ([['sucursal', 'Mi sucursal']] as const)
            : ([] as const)),
        ] as const).map(([k, label]) => (
          <Button
            key={k} size="sm"
            variant={quien === k ? 'default' : 'outline'}
            onClick={() => setQuien(k as typeof quien)}
            className="h-7 text-xs"
          >
            {label}
          </Button>
        ))}

        <span className="mx-1 h-5 w-px bg-border" />

        <Button
          size="sm" variant={fuente === null ? 'secondary' : 'ghost'}
          onClick={() => setFuente(null)} className="h-7 text-xs"
        >
          todas las fuentes
        </Button>
        {Object.entries(resumen.por_fuente).map(([f, n]) => (
          <Button
            key={f} size="sm"
            variant={fuente === f ? 'secondary' : 'ghost'}
            onClick={() => setFuente(fuente === f ? null : f)}
            className="h-7 text-xs"
          >
            {FUENTES[f] ?? f} ({n})
          </Button>
        ))}
      </div>

      {quien === 'mio' && resumen.mios === 0 && (
        <p className="rounded-lg border border-dashed p-3 text-xs leading-snug">
          <b>Ningún renglón tiene responsable asignado todavía.</b> El filtro muestra cero porque
          cero es la verdad: nadie es dueño de nada de esto. No es un error de la pantalla, es lo
          que hay que arreglar — y el agente Canal ya lo venía diciendo en la v1.4.
        </p>
      )}

      {/* ── LA LISTA, CON PLATA ──────────────────────────────────────── */}
      {!!conPlata.length && (
        <div className="divide-y rounded-lg border">
          {conPlata.map((x) => (
            <Fila key={`${x.fuente}:${x.clave}`} x={x} />
          ))}
        </div>
      )}

      {/* ── E.2 · Y LO QUE NO SE PUEDE COSTEAR, ABAJO Y SEPARADO ────── */}
      {!!sinPlata.length && (
        <section className="space-y-2">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <HelpCircle className="size-3.5" />
            Lo que no se puede costear ({sinPlata.length})
          </h3>
          <p className="text-[11px] leading-snug text-muted-foreground">
            {resumen.que_parte_no_se_puede_costear}
          </p>
          <div className="divide-y rounded-lg border border-dashed">
            {sinPlata.map((x) => (
              <Fila key={`${x.fuente}:${x.clave}`} x={x} />
            ))}
          </div>
        </section>
      )}

      {!filtrados.length && !resumen.vacia && (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No hay nada con ese filtro. <b>Este cero es del filtro</b>, no de la bandeja: hay{' '}
          {items.length} renglones esperando en total.
        </p>
      )}
    </div>
  )
}

function Fila({ x }: { x: Espera }) {
  return (
    <Link
      href={x.href}
      className="flex flex-wrap items-start gap-x-2 gap-y-1 px-3 py-2.5 text-xs hover:bg-muted/50"
    >
      {x.riesgo && <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-destructive" />}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-1.5">
          <Badge variant="outline" className="text-[10px]">
            {FUENTES[x.fuente] ?? x.fuente}
          </Badge>
          <span className="font-medium">{x.titulo}</span>
          {x.sucursal && <span className="text-muted-foreground">· {x.sucursal}</span>}
          {x.vencido && (
            <Badge variant="destructive" className="text-[10px]">vencido</Badge>
          )}
        </div>
        <p className="mt-0.5 leading-snug text-muted-foreground">{x.que_pasa}</p>
        {x.por_que_no_se_puede_costear && (
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
            {x.por_que_no_se_puede_costear}
          </p>
        )}
      </div>

      <div className="shrink-0 text-right">
        {x.plata !== null && (
          <p className="font-semibold tabular-nums">{formatARS(x.plata, 0)}</p>
        )}
        {x.costo_por_dia !== null && (
          <p className="font-semibold tabular-nums text-destructive">
            {formatARS(x.costo_por_dia, 0)}
            <span className="font-normal text-muted-foreground"> /día</span>
          </p>
        )}
        <p className="mt-0.5 flex items-center justify-end gap-1 text-[11px] text-muted-foreground">
          {x.accion}
          <ArrowRight className="size-3" />
        </p>
      </div>
    </Link>
  )
}
