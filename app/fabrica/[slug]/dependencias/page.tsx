import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/server'
import { construirGrafo, tablasSinDueno } from '@/lib/fabrica/grafo'
import { traerProyecto } from '@/lib/fabrica/datos'
import { ETIQUETA_CATEGORIA } from '@/lib/fabrica/tipos'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Dependencias' }

export default async function DependenciasPage({ params }: { params: { slug: string } }) {
  const proyecto = await traerProyecto(params.slug)
  if (!proyecto) notFound()

  const grafo = construirGrafo()
  const tablas = await tablasSinDueno(createClient())

  const niveles = [...new Set(grafo.nodos.map((n) => n.nivel))].sort((a, b) => a - b)
  const pct = tablas.total === 0 ? 0 : Math.round((tablas.conDueno / tablas.total) * 100)

  return (
    <div className="space-y-8 p-4 md:p-6">
      {/* ── Salud del grafo ───────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold tracking-tight">Cómo se apoyan los pools</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Cada columna es un nivel: los de la izquierda no dependen de nadie. El
          orden de instalación se lee de izquierda a derecha.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <Badge variant={grafo.ciclos.length === 0 ? 'success' : 'destructive'} className="font-normal">
            {grafo.ciclos.length === 0 ? 'sin dependencias circulares' : `${grafo.ciclos.length} circular(es)`}
          </Badge>
          <Badge variant={grafo.huerfanos.length === 0 ? 'success' : 'warning'} className="font-normal">
            {grafo.huerfanos.length === 0 ? 'sin pools huérfanos' : `${grafo.huerfanos.length} huérfano(s)`}
          </Badge>
          {grafo.colgadas.length > 0 && (
            <Badge variant="outline" className="font-normal">
              {grafo.colgadas.length} dependencia(s) a pools sin declarar
            </Badge>
          )}
        </div>

        {grafo.ciclos.length > 0 && (
          <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
            <p className="font-medium">Hay dependencias circulares.</p>
            <p className="mt-1 text-muted-foreground">
              Un ciclo hace imposible decidir en qué orden instalar, y por lo
              tanto imposible instalar.
            </p>
            <ul className="mt-2 space-y-1 font-mono text-xs">
              {grafo.ciclos.map((c, i) => (
                <li key={i}>{c.join(' → ')}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-4 flex gap-4 overflow-x-auto pb-2">
          {niveles.map((nivel) => (
            <div key={nivel} className="min-w-56 flex-1 shrink-0">
              <div className="mb-2 text-xs font-medium text-muted-foreground">
                Nivel {nivel}
                {nivel === 0 && ' · no dependen de nadie'}
              </div>
              <div className="space-y-2">
                {grafo.nodos
                  .filter((n) => n.nivel === nivel)
                  .map((n) => (
                    <Link
                      key={n.clave}
                      href={`/fabrica/${proyecto.slug}/pools/${n.clave}`}
                      className="block rounded-lg border border-border p-3 transition-colors hover:border-foreground/25 hover:bg-muted/40"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium">{n.nombre}</span>
                        <Badge
                          variant={n.categoria === 'nucleo' ? 'info' : 'outline'}
                          className="shrink-0 font-normal"
                        >
                          {ETIQUETA_CATEGORIA[n.categoria]}
                        </Badge>
                      </div>
                      {n.base && (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          todos dependen de él
                        </p>
                      )}
                      {n.depende_de.length > 0 && (
                        <p className="mt-1.5 font-mono text-[10px] text-muted-foreground">
                          ← {n.depende_de.join(', ')}
                        </p>
                      )}
                      {!n.base && n.usado_por.length > 0 && (
                        <p className="font-mono text-[10px] text-muted-foreground">
                          → {n.usado_por.join(', ')}
                        </p>
                      )}
                    </Link>
                  ))}
              </div>
            </div>
          ))}
        </div>

        {grafo.colgadas.length > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            Apuntan a pools que todavía no se declararon:{' '}
            {grafo.colgadas.map((c) => `${c.de} → ${c.a}`).join(' · ')}
          </p>
        )}
      </section>

      {/* ── Tablas sin dueño ──────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold tracking-tight">Tablas sin pool dueño</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Sacado de la base, no de la memoria. Una tabla sin dueño es una tabla
          que nadie se lleva al mudarse: si el proyecto se rearma en otro lado,
          esos datos no existen.
        </p>

        <div className="mt-4 rounded-lg border border-border p-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <span className="text-4xl font-semibold tabular-nums">{tablas.conDueno}</span>
              <span className="text-lg text-muted-foreground"> / {tablas.total} tablas</span>
            </div>
            <span className="text-2xl font-semibold tabular-nums text-muted-foreground">{pct}%</span>
          </div>
          <div
            className="mt-4 h-2 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Tablas con pool dueño"
          >
            <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            No se cuentan las tablas <code className="font-mono">fab_*</code>: son de la
            fábrica, que es otro producto.
          </p>
        </div>

        {tablas.sinDueno.length > 0 && (
          <details className="mt-3 rounded-lg border border-border">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
              Ver las {tablas.sinDueno.length} sin dueño
            </summary>
            <div className="flex flex-wrap gap-1.5 border-t border-border p-4">
              {tablas.sinDueno.map((t) => (
                <span
                  key={t}
                  className="rounded border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
                >
                  {t}
                </span>
              ))}
            </div>
          </details>
        )}
      </section>
    </div>
  )
}
