'use client'

import Link from 'next/link'
import { ArrowLeft, AlertTriangle, Info, ShieldCheck } from 'lucide-react'

import { formatARS } from '@/lib/utils/format'
import {
  type Equivalente, type PorQueNoHay, type Cobertura, type Relacion,
  RELACION_TEXTO, frasePrecio,
} from '@/lib/mostrador/producto'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

type Prod = {
  producto_id: string; sku: string; nombre: string
  nombre_comercial: string | null; laboratorio: string | null
  presentacion: string | null; droga_principal: string | null
  concentracion: string | null
  precio: number | null; margen_pct: number | null
  requiere_receta: boolean; condicion_venta: string | null
  stock: number
}

const ORDEN: Relacion[] = ['misma_composicion', 'generico', 'de_marca', 'otra_presentacion']

type Sugerencia = {
  hay: boolean; por_que: string
  regla_id?: string; producto_id?: string; nombre?: string; sku?: string
  precio?: number | null; stock?: number
  veces_ofrecida?: number; veces_aceptada?: number
} | null

export function ProductoClient({
  producto: p, equivalentes, porQue, cobertura, sucursalNombre, fotoDelStock, verPlata,
  sugerencia,
}: {
  producto: Prod
  equivalentes: Equivalente[]
  porQue: PorQueNoHay
  cobertura: Cobertura[]
  sucursalNombre: string
  fotoDelStock: string
  verPlata: boolean
  /** E.4 · UNA, la mejor. Null cuando no hay ninguna regla que aplique. */
  sugerencia: Sugerencia
}) {
  const porRelacion = ORDEN
    .map((r) => ({ r, items: equivalentes.filter((e) => e.relacion === r) }))
    .filter((g) => g.items.length > 0)

  return (
    <div className="mx-auto max-w-2xl">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background/95 p-3 backdrop-blur">
        <Button size="icon" variant="ghost" asChild className="size-10 shrink-0">
          <Link href="/mostrador" aria-label="Volver"><ArrowLeft className="size-5" /></Link>
        </Button>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium leading-tight">{p.nombre}</div>
          <div className="truncate text-xs text-muted-foreground">
            {[p.presentacion, p.laboratorio].filter(Boolean).join(' · ')}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-semibold tabular-nums">
            {p.precio != null ? formatARS(p.precio) : '—'}
          </div>
        </div>
      </header>

      <div className="space-y-6 p-3">
        {/* ── LO QUE ES, SIN INTERPRETAR ───────────────────────────────── */}
        <section className="space-y-1.5">
          <dl className="space-y-1 text-sm">
            <Dato k="Monodroga" v={p.droga_principal ?? 'no está cargada en el maestro'} />
            <Dato k="Concentración" v={p.concentracion ?? 'no se pudo leer de la presentación'} />
            <Dato k="Código" v={p.sku} />
            <Dato k={`Stock en ${sucursalNombre}`} v={`${Math.round(p.stock)}`} />
            {verPlata && p.margen_pct != null && <Dato k="Deja" v={`${p.margen_pct}%`} />}
          </dl>
          <p className="text-[11px] text-muted-foreground">{fotoDelStock}.</p>
        </section>

        {p.stock <= 0 && (
          <Button size="lg" className="h-12 w-full" asChild>
            <Link href={`/mostrador/${p.producto_id}/donde-hay`}>
              No hay acá — buscar en las otras sucursales
            </Link>
          </Button>
        )}

        {/* ── B · EQUIVALENCIAS ───────────────────────────────────────── */}
        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Lo mismo, de otra forma
            </h2>
            <p className="text-xs leading-snug text-muted-foreground">
              Es información del catálogo: qué otro producto tiene la misma composición. Si se
              puede cambiar uno por el otro en un caso concreto, eso lo contesta el farmacéutico.
            </p>
          </div>

          {/* B.6 · cuando no se puede saber, se dice por qué. */}
          {!porQue.se_puede ? (
            <div className="space-y-1.5 rounded-lg border border-dashed p-3">
              <p className="text-sm">
                <b>No se pueden buscar equivalentes de este producto.</b>
              </p>
              <p className="text-xs leading-snug text-muted-foreground">{porQue.por_que}</p>
              {porQue.que_lo_arregla && (
                <p className="text-xs leading-snug text-muted-foreground">
                  Lo arregla: {porQue.que_lo_arregla}.
                </p>
              )}
              {porQue.igual_se_puede && (
                <p className="text-xs leading-snug">
                  Lo que sí se puede: {porQue.igual_se_puede}.
                </p>
              )}
            </div>
          ) : equivalentes.length === 0 ? (
            <p className="rounded-lg border border-dashed p-3 text-xs leading-snug text-muted-foreground">
              Este producto tiene la monodroga cargada (<b>{porQue.monodroga}</b>) y{' '}
              <b>no hay ningún otro en el catálogo con esa misma composición</b>. Eso sí es un
              cero: se miró y no hay.
            </p>
          ) : (
            porRelacion.map(({ r, items }) => (
              <div key={r} className="space-y-1.5">
                <div>
                  <h3 className="text-xs font-semibold">{RELACION_TEXTO[r].titulo}</h3>
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    {RELACION_TEXTO[r].que_es}
                  </p>
                </div>
                <ul className="divide-y rounded-lg border">
                  {items.map((e) => <ItemEq key={e.producto_id} e={e} />)}
                </ul>
              </div>
            ))
          )}
        </section>

        {/* ── E.4 · UNA SOLA SUGERENCIA ───────────────────────────────── */}
        {sugerencia?.hay && (
          <section className="space-y-1.5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Lo que suele ir con esto
            </h2>
            <div className="rounded-lg border p-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-medium leading-tight">{sugerencia.nombre}</div>
                  <div className="text-xs text-muted-foreground">
                    hay {Math.round(Number(sugerencia.stock ?? 0))}
                  </div>
                </div>
                {sugerencia.precio != null && (
                  <div className="shrink-0 font-semibold tabular-nums">
                    {formatARS(Number(sugerencia.precio))}
                  </div>
                )}
              </div>
              <p className="mt-1 text-xs leading-snug text-muted-foreground">
                {sugerencia.por_que}
              </p>
            </div>
            <p className="text-[11px] leading-snug text-muted-foreground">
              Es <b>una sola</b>: tres son ruido y se dejan de mirar. Y es una regla comercial, no
              una indicación — el sistema no sugiere medicamentos a partir de otros.
            </p>
          </section>
        )}

        {/* ── B.5 / E.5 · LA COBERTURA ────────────────────────────────── */}
        <section className="space-y-2">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Qué cubre cada convenio
            </h2>
            <p className="text-xs leading-snug text-muted-foreground">
              Lo que dice el padrón sobre este producto. Mirá cuál coincide con la credencial que
              tenés delante: <b>el sistema no registra de quién es</b>.
            </p>
          </div>

          {cobertura.length === 0 ? (
            <div className="space-y-1.5 rounded-lg border border-dashed p-3">
              <p className="text-sm"><b>No hay ningún convenio cargado en el padrón.</b></p>
              <p className="text-xs leading-snug text-muted-foreground">
                Eso no quiere decir que los convenios no cubran este producto: quiere decir que
                nadie cargó qué cubre cada uno. Entre el 50% y el 70% de lo que se despacha pasa
                por una obra social.
              </p>
            </div>
          ) : (
            <ul className="divide-y rounded-lg border">
              {cobertura.map((c) => (
                <li key={c.convenio_id} className="space-y-0.5 p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{c.convenio}</span>
                    {c.sigla && <code className="text-xs text-muted-foreground">{c.sigla}</code>}
                    <span className="ml-auto tabular-nums">
                      {c.de_bolsillo != null
                        ? <>paga <b>{formatARS(c.de_bolsillo)}</b></>
                        : <span className="text-muted-foreground">no se puede calcular</span>}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {c.cubre_pct_texto} · {c.de_donde}
                  </p>
                  {c.exige && c.exige.length > 0 && (
                    <p className="flex items-start gap-1.5 text-xs leading-snug">
                      <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                      Exige: {c.exige.map((x) => x.replace(/_/g, ' ')).join(', ')}. Si falta, lo
                      debitan.
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* La línea, repetida donde se puede olvidar. */}
        <div className="flex gap-2 border-l-2 border-foreground/60 bg-muted/30 p-3">
          <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p className="text-xs leading-snug text-muted-foreground">
            Esta pantalla dice qué hay, qué composición tiene y a qué precio. Qué conviene tomar,
            cuánto y por cuántos días es una indicación profesional:{' '}
            <Link href="/mostrador/farmaceutico" className="underline">lo contesta el farmacéutico</Link>.
          </p>
        </div>
      </div>
    </div>
  )
}

function Dato({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex flex-wrap gap-x-2">
      <dt className="text-muted-foreground">{k}:</dt>
      <dd>{v}</dd>
    </div>
  )
}

function ItemEq({ e }: { e: Equivalente }) {
  return (
    <li>
      <Link href={`/mostrador/${e.producto_id}`} className="block space-y-0.5 p-2.5">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium leading-tight">{e.nombre}</div>
            <div className="text-xs text-muted-foreground">
              {[e.presentacion, e.laboratorio].filter(Boolean).join(' · ')}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-sm font-semibold tabular-nums">
              {e.precio != null ? formatARS(e.precio) : '—'}
            </div>
            {/* B.4 · la diferencia de precio, al lado. */}
            <div className="text-[11px] text-muted-foreground">{frasePrecio(e)}</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          {e.disponible > 0
            ? <span className="text-muted-foreground">hay {Math.round(e.disponible)}</span>
            : <span className="text-muted-foreground">no hay acá</span>}
          {e.en_oferta && <Badge variant="outline" className="text-[10px]">en oferta</Badge>}
          {e.misma_concentracion === false && (
            <Badge variant="outline" className="text-[10px]">
              otra concentración{e.concentracion ? `: ${e.concentracion}` : ''}
            </Badge>
          )}
          {e.misma_concentracion === null && (
            <span className="text-muted-foreground">
              no se pudo leer la concentración: no se asume que coincida
            </span>
          )}
        </div>
      </Link>
    </li>
  )
}
