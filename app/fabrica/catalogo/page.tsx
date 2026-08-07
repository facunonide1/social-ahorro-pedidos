import { PageHeader } from '@/components/shared/page-header'
import { Badge } from '@/components/ui/badge'
import { listarPools } from '@/lib/fabrica/datos'
import {
  ETIQUETA_CATEGORIA,
  type CategoriaPool,
  type EstadoPool,
} from '@/lib/fabrica/tipos'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Catálogo de pools' }

const ORDEN: CategoriaPool[] = ['nucleo', 'generico', 'vertical']

const EXPLICACION: Record<CategoriaPool, string> = {
  nucleo: 'No se desinstalan. Todo proyecto los tiene.',
  generico: 'Sirven a cualquier rubro con configuración.',
  vertical: 'Específicos de un rubro. Se instalan sólo donde corresponden.',
}

const VARIANTE_ESTADO: Record<EstadoPool, 'outline' | 'info' | 'success' | 'secondary'> = {
  borrador: 'outline',
  declarado: 'info',
  estable: 'success',
  deprecado: 'secondary',
}

export default async function CatalogoPage() {
  const pools = await listarPools()

  return (
    <>
      <PageHeader
        title="Catálogo de pools"
        description="Las piezas que la fábrica sabe instalar. El catálogo es global: un pool no pertenece a un proyecto, se instala en varios."
      />

      <div className="space-y-8 p-4 md:p-6">
        {pools.length === 0 ? (
          <div className="rounded-lg border border-dashed py-14 text-center">
            <p className="text-sm font-medium">El catálogo está vacío.</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Todavía no se declaró ninguna pieza. El censo de un proyecto
              muestra qué hay para declarar.
            </p>
          </div>
        ) : (
          ORDEN.map((cat) => {
            const delGrupo = pools.filter((p) => p.categoria === cat)
            if (delGrupo.length === 0) return null
            return (
              <section key={cat}>
                <h2 className="text-sm font-semibold tracking-tight">
                  {ETIQUETA_CATEGORIA[cat]}
                  <span className="ml-2 font-normal text-muted-foreground">
                    {delGrupo.length}
                  </span>
                </h2>
                <p className="mt-0.5 text-sm text-muted-foreground">{EXPLICACION[cat]}</p>

                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {delGrupo.map((p) => (
                    <div key={p.id} className="rounded-lg border border-border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate font-medium tracking-tight">{p.nombre}</h3>
                          <p className="font-mono text-[11px] text-muted-foreground">
                            {p.clave}
                          </p>
                        </div>
                        <Badge
                          variant={VARIANTE_ESTADO[p.estado]}
                          className="shrink-0 font-normal"
                        >
                          {p.estado}
                        </Badge>
                      </div>

                      {p.descripcion && (
                        <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                          {p.descripcion}
                        </p>
                      )}

                      {p.depende_de.length > 0 && (
                        <p className="mt-3 border-t border-border pt-2 text-xs text-muted-foreground">
                          Necesita:{' '}
                          <span className="font-mono">{p.depende_de.join(', ')}</span>
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )
          })
        )}
      </div>
    </>
  )
}
