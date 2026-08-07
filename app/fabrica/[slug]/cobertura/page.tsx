import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Badge } from '@/components/ui/badge'
import { listarCenso, listarInstalaciones, traerProyecto } from '@/lib/fabrica/datos'
import {
  ETIQUETA_CLASIFICACION,
  type ClasificacionSector,
} from '@/lib/fabrica/tipos'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Cobertura' }

const ORDEN: ClasificacionSector[] = ['nucleo', 'generico', 'vertical', 'a_medida', 'incompleto']

export default async function CoberturaPage({ params }: { params: { slug: string } }) {
  const proyecto = await traerProyecto(params.slug)
  if (!proyecto) notFound()

  const [censo, instalaciones] = await Promise.all([
    listarCenso(proyecto.id),
    listarInstalaciones(proyecto.id),
  ])
  const declarados = new Set(
    instalaciones.map((i) => i.pool?.clave).filter(Boolean) as string[],
  )

  const total = censo.length
  const cubiertos = censo.filter((s) => declarados.has(s.clave)).length
  const pct = total === 0 ? 0 : Math.round((cubiertos / total) * 100)

  const pantallasTotal = censo.reduce((a, s) => a + s.pantallas, 0)
  const pantallasCubiertas = censo
    .filter((s) => declarados.has(s.clave))
    .reduce((a, s) => a + s.pantallas, 0)

  const porGrupo = ORDEN.map((c) => {
    const del = censo.filter((s) => s.clasificacion === c)
    return {
      clasificacion: c,
      total: del.length,
      cubiertos: del.filter((s) => declarados.has(s.clave)).length,
      sectores: del,
    }
  }).filter((g) => g.total > 0)

  return (
    <div className="space-y-8 p-4 md:p-6">
      <section>
        <h2 className="text-sm font-semibold tracking-tight">Cuánto sabe la fábrica de este proyecto</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Cada sector del censo que todavía no es un pool es software que existe
          y que la fábrica no puede volver a armar en otro lado. Ésta es la barra
          de progreso real.
        </p>

        <div className="mt-4 rounded-lg border border-border p-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <span className="text-4xl font-semibold tabular-nums">{cubiertos}</span>
              <span className="text-lg text-muted-foreground"> / {total} sectores</span>
            </div>
            <span className="text-2xl font-semibold tabular-nums text-muted-foreground">
              {pct}%
            </span>
          </div>

          <div
            className="mt-4 h-2 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Sectores declarados"
          >
            <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            {pantallasCubiertas} de {pantallasTotal} pantallas están dentro de un
            pool declarado.
          </p>
        </div>
      </section>

      {porGrupo.map((g) => (
        <section key={g.clasificacion}>
          <h3 className="text-sm font-semibold tracking-tight">
            {ETIQUETA_CLASIFICACION[g.clasificacion]}
            <span className="ml-2 font-normal text-muted-foreground">
              {g.cubiertos} de {g.total}
            </span>
          </h3>
          <div className="mt-2 overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <tbody>
                {g.sectores.map((s) => {
                  const ok = declarados.has(s.clave)
                  return (
                    <tr key={s.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-2">
                        <span className={ok ? 'font-medium' : 'text-muted-foreground'}>
                          {s.nombre}
                        </span>
                        {s.ruta_base && s.ruta_base !== '#' && (
                          <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                            {s.ruta_base}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right text-xs tabular-nums text-muted-foreground">
                        {s.pantallas} pantallas
                      </td>
                      <td className="w-40 px-3 py-2 text-right">
                        {ok ? (
                          <Link
                            href={`/fabrica/${proyecto.slug}/pools/${s.clave}`}
                            className="inline-flex"
                          >
                            <Badge variant="success" className="font-normal">declarado</Badge>
                          </Link>
                        ) : (
                          <Badge variant="outline" className="font-normal">
                            {s.completitud === 'placeholder' ? 'no existe' : 'sin declarar'}
                          </Badge>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  )
}
