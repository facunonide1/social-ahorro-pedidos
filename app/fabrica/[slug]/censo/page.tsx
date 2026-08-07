import { notFound } from 'next/navigation'

import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/server'
import { chequearCenso, resumir, sinDeclarar } from '@/lib/fabrica/censo'
import { listarCenso, traerProyecto } from '@/lib/fabrica/datos'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Censo' }

/**
 * El chequeo censo ↔ manifiestos, corriendo de verdad al abrir la pantalla.
 *
 * No se lee un resultado guardado: se recalcula. Un chequeo que corrió hace
 * tres semanas no dice nada sobre el código de hoy, y el valor entero de esta
 * pantalla es que falle visible cuando algo se contradice.
 */
export default async function CensoPage({ params }: { params: { slug: string } }) {
  const proyecto = await traerProyecto(params.slug)
  if (!proyecto) notFound()

  const censo = await listarCenso(proyecto.id)
  const contradicciones = await chequearCenso(censo, createClient())
  const pendientes = sinDeclarar(censo)

  const errores = contradicciones.filter((c) => c.gravedad === 'error')
  const avisos = contradicciones.filter((c) => c.gravedad === 'aviso')
  const ok = contradicciones.length === 0

  return (
    <div className="space-y-8 p-4 md:p-6">
      <section>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-semibold tracking-tight">
            El censo contra los manifiestos
          </h2>
          <Badge
            variant={errores.length > 0 ? 'destructive' : ok ? 'success' : 'warning'}
            className="font-normal"
          >
            {errores.length > 0 ? 'se contradicen' : ok ? 'coinciden' : 'diferencias menores'}
          </Badge>
        </div>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          El censo se escribió a mano mirando el repo; los manifiestos se
          escribieron después mirando el esquema. Nada garantiza que digan lo
          mismo — y no lo decían. Esta comprobación corre cada vez que se abre la
          pantalla, en los dos sentidos: qué declara el censo y no existe, y qué
          existe y el censo no declara.
        </p>
        <p className="mt-3 text-sm font-medium">{resumir(contradicciones)}</p>
      </section>

      {contradicciones.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold tracking-tight">
            {errores.length > 0 ? 'Contradicciones' : 'Diferencias'}
          </h3>
          <div className="mt-3 overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Sector</th>
                  <th className="px-3 py-2">Campo</th>
                  <th className="px-3 py-2">Dice el censo</th>
                  <th className="px-3 py-2">Dice el manifiesto</th>
                  <th className="px-3 py-2">Sentido</th>
                </tr>
              </thead>
              <tbody>
                {[...errores, ...avisos].map((c, i) => (
                  <tr key={`${c.sector}-${c.campo}-${i}`} className="border-t border-border align-top">
                    <td className="px-3 py-2 font-medium">{c.sector}</td>
                    <td className="px-3 py-2 font-mono text-xs">{c.campo}</td>
                    <td className="px-3 py-2 text-muted-foreground">{c.censo}</td>
                    <td className="px-3 py-2 text-muted-foreground">{c.real}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                      {c.sentido === 'censo→real' ? 'declarado y no existe' : 'existe y no se declara'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Se corrigen con <code className="font-mono">npx tsx scripts/fabrica-censar.ts --aplicar</code>.
            Lo que no tiene corrección automática necesita una decisión: el censo
            observa el sistema, no la declaración.
          </p>
        </section>
      )}

      <section>
        <h3 className="text-sm font-semibold tracking-tight">
          Sectores sin manifiesto
          <span className="ml-2 font-normal text-muted-foreground">{pendientes.length}</span>
        </h3>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          No es una contradicción: es cobertura. Están censados y todavía no se
          declararon.
        </p>
        {pendientes.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {pendientes.map((s) => (
              <Badge key={s.id} variant="outline" className="font-normal">
                {s.nombre}
              </Badge>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
