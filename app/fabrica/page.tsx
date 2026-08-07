import Link from 'next/link'

import { PageHeader } from '@/components/shared/page-header'
import { Badge } from '@/components/ui/badge'
import { listarProyectos } from '@/lib/fabrica/datos'
import { createClient } from '@/lib/supabase/server'
import type { EstadoProyecto } from '@/lib/fabrica/tipos'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Proyectos' }

const VARIANTE_ESTADO: Record<EstadoProyecto, 'outline' | 'info' | 'success' | 'warning'> = {
  alta: 'outline',
  armando: 'info',
  operando: 'success',
  pausado: 'warning',
}

export default async function ProyectosPage() {
  const proyectos = await listarProyectos()
  const sb = createClient()

  // Dos números por proyecto: cuánto tiene declarado y cuánto tiene sin declarar.
  // La distancia entre los dos es el estado real del proyecto en la fábrica.
  const conteos = await Promise.all(
    proyectos.map(async (p) => {
      const [{ count: sectores }, { count: instalados }] = await Promise.all([
        sb.from('fab_censo_sectores').select('id', { count: 'exact', head: true })
          .eq('proyecto_id', p.id),
        sb.from('fab_instalaciones').select('id', { count: 'exact', head: true })
          .eq('proyecto_id', p.id),
      ])
      return { id: p.id, sectores: sectores ?? 0, instalados: instalados ?? 0 }
    }),
  )
  const porId = new Map(conteos.map((c) => [c.id, c]))

  return (
    <>
      <PageHeader
        title="Proyectos"
        description="Cada proyecto es un negocio con su software compuesto. La fábrica los arma a partir del mismo catálogo de piezas."
      />

      <div className="p-4 md:p-6">
        {proyectos.length === 0 ? (
          <div className="rounded-lg border border-dashed py-14 text-center text-sm text-muted-foreground">
            Todavía no hay proyectos.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {proyectos.map((p) => {
              const c = porId.get(p.id)
              const sinDeclarar = Math.max(0, (c?.sectores ?? 0) - (c?.instalados ?? 0))
              return (
                <Link
                  key={p.id}
                  href={`/fabrica/${p.slug}`}
                  className="group rounded-lg border border-border p-4 transition-colors hover:border-foreground/25 hover:bg-muted/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="font-medium tracking-tight group-hover:underline">
                      {p.nombre}
                    </h2>
                    <Badge variant={VARIANTE_ESTADO[p.estado]} className="shrink-0 font-normal">
                      {p.estado}
                    </Badge>
                  </div>

                  {p.rubro && (
                    <p className="mt-1 font-mono text-[11px] text-muted-foreground">{p.rubro}</p>
                  )}
                  {p.descripcion && (
                    <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                      {p.descripcion}
                    </p>
                  )}

                  <dl className="mt-4 flex gap-5 border-t border-border pt-3 text-xs">
                    <div>
                      <dt className="text-muted-foreground">Declarados</dt>
                      <dd className="mt-0.5 text-lg font-semibold tabular-nums">
                        {c?.instalados ?? 0}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Sin declarar</dt>
                      <dd className="mt-0.5 text-lg font-semibold tabular-nums">
                        {sinDeclarar}
                      </dd>
                    </div>
                  </dl>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
