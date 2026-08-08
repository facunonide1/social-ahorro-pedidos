import { notFound } from 'next/navigation'

import { Badge } from '@/components/ui/badge'
import { informePreparacion } from '@/lib/fabrica/preparacion'
import { traerProyecto } from '@/lib/fabrica/datos'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Preparación del lector' }

export default async function LectorPage({ params }: { params: { slug: string } }) {
  const proyecto = await traerProyecto(params.slug)
  if (!proyecto) notFound()

  const informe = informePreparacion()
  const maxRiesgo = Math.max(...informe.map((p) => p.riesgo))

  return (
    <div className="space-y-8 p-4 md:p-6">
      <section>
        <h2 className="text-sm font-semibold tracking-tight">
          En qué orden prender el lector
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          El lector es la pieza que hace que la declaración <em>mande</em> sobre
          el código. No se prende en todos lados el mismo día: se prende en uno,
          se mira, y se sigue.
        </p>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          El orden es al revés de lo intuitivo. <strong>No gana el pool más
          completo: gana el que hace menos daño si la declaración está mal.</strong>{' '}
          Un pool con muchos elementos constitucionales es más peligroso
          justamente porque tiene más para romper.
        </p>
        <p className="mt-2 max-w-3xl text-xs text-muted-foreground">
          El número no es una opinión: sale de contar entidades propias,
          escritura en tablas ajenas, elementos constitucionales, acciones que
          tocan plata o salen del equipo, brechas abiertas y cuántos pools
          dependen de él.
        </p>
      </section>

      <ol className="space-y-3">
        {informe.map((p, i) => (
          <li key={p.clave} className="rounded-lg border border-border">
            <div className="flex flex-wrap items-start gap-3 border-b border-border p-4">
              <span className="grid size-7 shrink-0 place-items-center rounded-full border border-border text-xs font-semibold tabular-nums">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-medium tracking-tight">{p.nombre}</h3>
                  <span className="font-mono text-[10px] text-muted-foreground">{p.clave}</span>
                  <Badge
                    variant={p.categoria === 'nucleo' ? 'info' : 'outline'}
                    className="font-normal"
                  >
                    {p.categoria === 'nucleo' ? 'Núcleo' : 'Genérico'}
                  </Badge>
                  {p.brechas.length > 0 && (
                    <Badge variant="warning" className="font-normal">
                      {p.brechas.length} brecha abierta
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-sm">{p.veredicto}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <div className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-muted sm:block">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${(p.riesgo / maxRiesgo) * 100}%` }}
                  />
                </div>
                <span className="w-8 text-right text-lg font-semibold tabular-nums">
                  {p.riesgo}
                </span>
              </div>
            </div>

            <div className="grid gap-x-6 gap-y-1 p-4 text-xs sm:grid-cols-2">
              <div className="text-muted-foreground">
                <span className="font-medium text-foreground">De qué está hecho: </span>
                {p.factores.join(' · ') || 'nada que sumara riesgo'}
              </div>
              <div className="text-muted-foreground">
                <span className="font-medium text-foreground">Qué falta declarar: </span>
                {p.incompleto.join(' · ') || 'nada'}
              </div>
            </div>

            {p.brechas.length > 0 && (
              <div className="border-t border-border p-4">
                {p.brechas.map((b) => (
                  <p key={b} className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Brecha: </span>
                    {b}
                  </p>
                ))}
              </div>
            )}
          </li>
        ))}
      </ol>

      <section>
        <h3 className="text-sm font-semibold tracking-tight">Lo que este orden no dice</h3>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Que un pool esté primero no quiere decir que su declaración sea mejor:
          los diez están en 0 diferencias contra el código. Quiere decir que si
          igual estuviera mal, el daño se queda adentro. Compras y Centro de
          Datos van últimos porque escriben en tablas de otros pools — ahí una
          declaración equivocada sale del pool y llega a donde no la esperan.
        </p>
      </section>
    </div>
  )
}
