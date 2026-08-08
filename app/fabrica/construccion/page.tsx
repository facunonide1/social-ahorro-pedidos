import type { Metadata } from 'next'

import { Badge } from '@/components/ui/badge'
import { ControlesPedido } from '@/components/fabrica/controles-pedidos'
import {
  colaDeConstruccion,
  ETIQUETA_ESTADO,
  ETIQUETA_FALTA,
  type GrupoDePedidos,
} from '@/lib/fabrica/pedidos'
import { requireFabricaAccess } from '@/lib/fabrica/auth'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Cola de construcción' }

/**
 * LA COLA DE CONSTRUCCIÓN.
 *
 * Lo que se pidió y todavía no existe, ordenado por DEMANDA y no por fecha.
 *
 * Es la pantalla que convierte "qué construyo ahora" de intuición en dato:
 * primero lo que se pidió en más proyectos distintos, después lo que se pidió
 * más veces, y recién al final lo más viejo. Un pedido que hizo una sola
 * persona una sola vez puede ser urgente, pero no es la cola: es una excepción,
 * y una excepción se decide mirándola, no ordenándola primero.
 */
export default async function ConstruccionPage() {
  const acceso = await requireFabricaAccess()
  const grupos = await colaDeConstruccion()

  const abiertos = grupos.filter((g) => g.cabeza.estado === 'abierto' || g.cabeza.estado === 'en_analisis')
  const cerrados = grupos.filter((g) => !abiertos.includes(g))

  return (
    <div className="space-y-8 p-4 md:p-6">
      <section>
        <h1 className="font-[family-name:var(--font-fraunces)] text-xl">Cola de construcción</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Lo que se pidió y todavía no existe. Sale de conversaciones reales: el
          chat lo ofrece cuando tiene que decir que algo no se puede, y lo anota
          sólo si la persona dice que sí.
        </p>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Está ordenada por <span className="font-medium">demanda</span>, no por
          fecha: primero lo que se pidió en más proyectos distintos. Es la
          diferencia entre construir lo que hace falta y construir lo que se
          pidió último.
        </p>
      </section>

      {grupos.length === 0 ? (
        <p className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          Todavía no hay pedidos. Aparecen solos cuando alguien le pide al chat
          algo que la fábrica no puede hacer.
        </p>
      ) : (
        <>
          <Cola titulo="Abiertos" grupos={abiertos} puedeDecidir={acceso.esDueno} />
          {cerrados.length > 0 && (
            <Cola titulo="Cerrados" grupos={cerrados} puedeDecidir={acceso.esDueno} />
          )}
        </>
      )}
    </div>
  )
}

function Cola({
  titulo,
  grupos,
  puedeDecidir,
}: {
  titulo: string
  grupos: GrupoDePedidos[]
  puedeDecidir: boolean
}) {
  if (grupos.length === 0) return null
  return (
    <section>
      <h2 className="text-sm font-semibold tracking-tight">
        {titulo}
        <span className="ml-2 font-normal text-muted-foreground">{grupos.length}</span>
      </h2>
      <div className="mt-3 space-y-3">
        {grupos.map((g) => (
          <article key={g.cabeza.id} className="rounded-lg border border-border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <p className="max-w-2xl text-sm font-medium">{g.cabeza.pedido}</p>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={g.proyectos.length > 1 ? 'default' : 'outline'}>
                  {g.veces} vez/veces · {g.proyectos.length} proyecto(s)
                </Badge>
                <Badge variant="outline">{ETIQUETA_ESTADO[g.cabeza.estado]}</Badge>
              </div>
            </div>

            <dl className="mt-3 grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
              <Campo titulo="Qué falta">{ETIQUETA_FALTA[g.cabeza.falta]}</Campo>
              <Campo titulo="Quién lo pidió">
                {g.proyectos.join(', ')} · {g.personas || 1} persona(s)
              </Campo>
              {g.cabeza.contexto && <Campo titulo="Contexto">{g.cabeza.contexto}</Campo>}
              {g.cabeza.seParece && <Campo titulo="Se parece a">{g.cabeza.seParece}</Campo>}
              <Campo titulo="Qué desbloquea">
                {g.desbloquea.pools.length > 0
                  ? `pools: ${g.desbloquea.pools.join(', ')} · `
                  : 'ningún pool en particular · '}
                {g.desbloquea.proyectos.length > 0
                  ? `proyectos: ${g.desbloquea.proyectos.join(', ')}`
                  : 'ningún proyecto esperándolo'}
              </Campo>
              {g.cabeza.motivoCierre && <Campo titulo="Se cerró porque">{g.cabeza.motivoCierre}</Campo>}
            </dl>

            {g.miembros.length > 1 && (
              <details className="mt-3 text-xs">
                <summary className="cursor-pointer text-muted-foreground">
                  Los otros {g.miembros.length - 1} pedido(s) que dicen lo mismo
                </summary>
                <ul className="mt-2 space-y-1 border-l border-border pl-3">
                  {g.miembros
                    .filter((m) => m.id !== g.cabeza.id)
                    .map((m) => (
                      <li key={m.id} className="text-muted-foreground">
                        <span className="font-medium text-foreground">{m.proyectoNombre}</span>:{' '}
                        {m.pedido}
                      </li>
                    ))}
                </ul>
              </details>
            )}

            {puedeDecidir && (
              <div className="mt-3">
                <ControlesPedido
                  id={g.cabeza.id}
                  estado={g.cabeza.estado}
                  candidatos={grupos
                    .filter((o) => o.cabeza.id !== g.cabeza.id)
                    .map((o) => ({ id: o.cabeza.id, texto: o.cabeza.pedido }))}
                />
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  )
}

function Campo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground">{titulo}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  )
}
