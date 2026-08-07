import { notFound } from 'next/navigation'

import { Badge } from '@/components/ui/badge'
import { listarCenso, traerProyecto } from '@/lib/fabrica/datos'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Moldes' }

/**
 * Los cinco moldes previstos y los cuatro que salieron del censo.
 *
 * Se registran, NO se construyen. Un molde se construye cuando hay un pool que
 * lo necesita generado, y hoy los cuatro pools están en espejo.
 */
const PREVISTOS = [
  { clave: 'lista maestra', nombre: 'Lista maestra', que: 'Muchas filas, filtros, exportar' },
  { clave: 'ficha', nombre: 'Ficha', que: 'Una cosa, todo lo suyo alrededor' },
  { clave: 'tablero', nombre: 'Tablero', que: 'Números y tendencia de un vistazo' },
  { clave: 'bandeja', nombre: 'Bandeja', que: 'Cola de cosas que esperan una decisión' },
  { clave: 'wizard', nombre: 'Wizard', que: 'Pasos hasta completar algo' },
]

const EMERGENTES = [
  { clave: 'CHAT', nombre: 'Chat', que: 'Un asistente por sector. El más repetido del sistema' },
  { clave: 'FORMULARIO/CONFIG', nombre: 'Formulario / Config', que: 'Reglas que alguien define una vez' },
  { clave: 'FEED', nombre: 'Feed', que: 'Lo que pasó, en orden, sin decisión asociada' },
  { clave: 'CALENDARIO', nombre: 'Calendario', que: 'Lo mismo pero ubicado en el tiempo' },
]

export default async function MoldesPage({ params }: { params: { slug: string } }) {
  const proyecto = await traerProyecto(params.slug)
  if (!proyecto) notFound()

  const censo = await listarCenso(proyecto.id)

  const cuenta = new Map<string, number>()
  for (const s of censo) {
    for (const [molde, n] of Object.entries(s.moldes ?? {})) {
      cuenta.set(molde, (cuenta.get(molde) ?? 0) + Number(n))
    }
  }

  const totalPantallas = [...cuenta.values()].reduce((a, b) => a + b, 0)
  const cubiertasPrevistos = PREVISTOS.reduce((a, m) => a + (cuenta.get(m.clave) ?? 0), 0)
  const cubiertasEmergentes = EMERGENTES.reduce((a, m) => a + (cuenta.get(m.clave) ?? 0), 0)
  const sinMolde = cuenta.get('otro') ?? 0

  const max = Math.max(1, ...cuenta.values())

  function Fila({ clave, nombre, que }: { clave: string; nombre: string; que: string }) {
    const n = cuenta.get(clave) ?? 0
    return (
      <div className="flex items-center gap-4 px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{nombre}</div>
          <div className="text-xs text-muted-foreground">{que}</div>
        </div>
        <div className="hidden h-1.5 w-40 overflow-hidden rounded-full bg-muted sm:block">
          <div className="h-full rounded-full bg-primary" style={{ width: `${(n / max) * 100}%` }} />
        </div>
        <div className="w-12 text-right text-sm font-semibold tabular-nums">{n}</div>
      </div>
    )
  }

  return (
    <div className="space-y-8 p-4 md:p-6">
      <section>
        <h2 className="text-sm font-semibold tracking-tight">La cola de construcción visual</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Un molde se construye una vez y lo usan todos los pools que lo declaren.
          Acá está cuántas pantallas del proyecto usaría cada uno. Se registran:
          construirlos es de otra sesión, cuando haya un pool generado que los pida.
        </p>

        <dl className="mt-4 grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-border p-4">
            <dt className="text-xs text-muted-foreground">Cubren los cinco previstos</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">
              {cubiertasPrevistos}
              <span className="text-sm font-normal text-muted-foreground"> / {totalPantallas}</span>
            </dd>
          </div>
          <div className="rounded-lg border border-border p-4">
            <dt className="text-xs text-muted-foreground">Suman los cuatro emergentes</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">{cubiertasEmergentes}</dd>
          </div>
          <div className="rounded-lg border border-border p-4">
            <dt className="text-xs text-muted-foreground">Siguen sin molde</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">{sinMolde}</dd>
          </div>
        </dl>
      </section>

      <section>
        <h3 className="text-sm font-semibold tracking-tight">
          Previstos
          <Badge variant="outline" className="ml-2 font-normal">5</Badge>
        </h3>
        <div className="mt-2 divide-y divide-border rounded-lg border border-border">
          {PREVISTOS.map((m) => <Fila key={m.clave} {...m} />)}
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold tracking-tight">
          Emergentes
          <Badge variant="info" className="ml-2 font-normal">4</Badge>
        </h3>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          No estaban previstos: salieron de mirar las 143 pantallas que ya
          existen. Chat es el más repetido del sistema — un asistente por sector —
          y es exactamente el que hoy no se puede generar, porque la fábrica sabe
          leer una declaración pero no escribirla.
        </p>
        <div className="mt-2 divide-y divide-border rounded-lg border border-border">
          {EMERGENTES.map((m) => <Fila key={m.clave} {...m} />)}
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold tracking-tight">Sin molde</h3>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          {sinMolde} pantallas no encajan en ninguno de los nueve. Buena parte son
          portadas de sector que mezclan tablero con accesos rápidos: probablemente
          haya un décimo molde ahí adentro, y se va a saber al declarar el quinto
          pool, no antes.
        </p>
      </section>
    </div>
  )
}
