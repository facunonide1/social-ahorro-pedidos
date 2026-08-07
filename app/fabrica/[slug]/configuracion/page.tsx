import { notFound } from 'next/navigation'

import { Badge } from '@/components/ui/badge'
import { listarCenso, traerProyecto } from '@/lib/fabrica/datos'
import { ETIQUETA_CLASIFICACION, type ClasificacionSector } from '@/lib/fabrica/tipos'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Configuración' }

const ORDEN: ClasificacionSector[] = ['nucleo', 'generico', 'vertical', 'a_medida', 'incompleto']

export default async function ConfiguracionPage({ params }: { params: { slug: string } }) {
  const proyecto = await traerProyecto(params.slug)
  if (!proyecto) notFound()

  const censo = await listarCenso(proyecto.id)

  const porClasif = ORDEN.map((c) => ({
    clasificacion: c,
    sectores: censo.filter((s) => s.clasificacion === c).length,
    pantallas: censo
      .filter((s) => s.clasificacion === c)
      .reduce((a, s) => a + s.pantallas, 0),
  })).filter((x) => x.sectores > 0)

  const entradas = Object.entries(proyecto.configuracion ?? {})

  return (
    <div className="space-y-8 p-4 md:p-6">
      <section>
        <h2 className="text-sm font-semibold tracking-tight">Identidad</h2>
        <dl className="mt-3 grid gap-x-8 gap-y-3 rounded-lg border border-border p-4 text-sm sm:grid-cols-2">
          <Dato k="Nombre" v={proyecto.nombre} />
          <Dato k="Slug" v={proyecto.slug} mono />
          <Dato k="Rubro" v={proyecto.rubro ?? '—'} mono />
          <Dato k="Alta" v={String(proyecto.fecha_alta).slice(0, 10)} />
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted-foreground">Estado</dt>
            <dd className="mt-1">
              <Badge variant="outline" className="font-normal">{proyecto.estado}</Badge>
            </dd>
          </div>
        </dl>
      </section>

      <section>
        <h2 className="text-sm font-semibold tracking-tight">Parámetros</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Lo que cambia entre proyectos sin cambiar una sola pieza.
        </p>
        {entradas.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
            Sin parámetros.
          </p>
        ) : (
          <dl className="mt-3 divide-y divide-border rounded-lg border border-border">
            {entradas.map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-4 px-4 py-2.5 text-sm">
                <dt className="font-mono text-xs text-muted-foreground">{k}</dt>
                <dd className="text-right">{String(v)}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold tracking-tight">Censo</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          La foto de lo que este proyecto tiene construido hoy. Es observación:
          describe lo que hay, no lo que debería haber.
        </p>
        <div className="mt-3 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Clasificación</th>
                <th className="px-3 py-2 text-right">Sectores</th>
                <th className="px-3 py-2 text-right">Pantallas</th>
              </tr>
            </thead>
            <tbody>
              {porClasif.map((x) => (
                <tr key={x.clasificacion} className="border-t border-border">
                  <td className="px-3 py-2">{ETIQUETA_CLASIFICACION[x.clasificacion]}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{x.sectores}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{x.pantallas}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {proyecto.notas && (
        <section>
          <h2 className="text-sm font-semibold tracking-tight">Notas</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{proyecto.notas}</p>
        </section>
      )}
    </div>
  )
}

function Dato({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{k}</dt>
      <dd className={mono ? 'mt-1 font-mono text-xs' : 'mt-1'}>{v}</dd>
    </div>
  )
}
