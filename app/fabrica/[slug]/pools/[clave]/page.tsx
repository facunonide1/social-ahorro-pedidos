import { notFound } from 'next/navigation'

import { Badge } from '@/components/ui/badge'
import { traerProyecto } from '@/lib/fabrica/datos'
import { verificarEspejo } from '@/lib/fabrica/comparador'
import { MANIFIESTOS } from '@/lib/fabrica/manifiestos'
import { ETIQUETA_MOLDE, type TipoDiferencia } from '@/lib/fabrica/tipos'

export const dynamic = 'force-dynamic'

const ETIQUETA_TIPO: Record<TipoDiferencia, string> = {
  entidad: 'Entidad',
  pantalla: 'Pantalla',
  accion: 'Acción',
  permiso: 'Permiso',
}

export async function generateMetadata({ params }: { params: { clave: string } }) {
  return { title: MANIFIESTOS[params.clave]?.manifiesto.nombre ?? 'Pool' }
}

export default async function VerificacionPoolPage({
  params,
}: {
  params: { slug: string; clave: string }
}) {
  const proyecto = await traerProyecto(params.slug)
  if (!proyecto) notFound()

  const entrada = MANIFIESTOS[params.clave]
  if (!entrada) notFound()

  const { manifiesto, prefijos } = entrada
  const verificacion = await verificarEspejo(manifiesto, prefijos)

  const propias = manifiesto.entidades.filter((e) => e.acceso === 'propia')
  const leidas = manifiesto.entidades.filter((e) => e.acceso === 'leida')

  return (
    <div className="space-y-8 p-4 md:p-6">
      {/* ── Veredicto ─────────────────────────────────────────────────── */}
      <section>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold tracking-tight">{manifiesto.nombre}</h2>
          <Badge variant="info" className="font-normal">espejo</Badge>
          <Badge
            variant={
              verificacion.resultado === 'coincide'
                ? 'success'
                : verificacion.resultado === 'difiere'
                  ? 'warning'
                  : 'destructive'
            }
            className="font-normal"
          >
            {verificacion.resultado}
          </Badge>
        </div>
        {manifiesto.descripcion && (
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            {manifiesto.descripcion}
          </p>
        )}
        <p className="mt-3 text-sm">{verificacion.resumen}</p>
        <p className="mt-2 max-w-3xl text-xs text-muted-foreground">
          Modo espejo: esta declaración describe código que ya existe y funciona.
          La fábrica no lo generó. Si algo no cuadra, se corrige la declaración —
          nunca el código de Ofertas.
        </p>
      </section>

      {/* ── Diferencias ───────────────────────────────────────────────── */}
      {verificacion.diferencias.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold tracking-tight">
            Diferencias
            <span className="ml-2 font-normal text-muted-foreground">
              {verificacion.diferencias.length}
            </span>
          </h3>
          <div className="mt-3 overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Elemento</th>
                  <th className="px-3 py-2">Dónde está</th>
                  <th className="px-3 py-2">Qué pasa</th>
                </tr>
              </thead>
              <tbody>
                {verificacion.diferencias.map((d, i) => (
                  <tr key={`${d.tipo}-${d.elemento}-${i}`} className="border-t border-border align-top">
                    <td className="px-3 py-2 whitespace-nowrap">{ETIQUETA_TIPO[d.tipo]}</td>
                    <td className="px-3 py-2 font-mono text-xs">{d.elemento}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs">
                      {d.en_declaracion && d.en_codigo
                        ? 'en ambos'
                        : d.en_codigo
                          ? 'sólo en el código'
                          : 'sólo en la declaración'}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{d.nota}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── La declaración ────────────────────────────────────────────── */}
      <section>
        <h3 className="text-sm font-semibold tracking-tight">
          Entidades propias
          <span className="ml-2 font-normal text-muted-foreground">{propias.length}</span>
        </h3>
        <dl className="mt-3 divide-y divide-border rounded-lg border border-border">
          {propias.map((e) => (
            <div key={e.tabla} className="px-4 py-2.5 text-sm sm:flex sm:gap-4">
              <dt className="font-mono text-xs sm:w-56 sm:shrink-0">{e.tabla}</dt>
              <dd className="text-muted-foreground">{e.rol}</dd>
            </div>
          ))}
        </dl>

        <h3 className="mt-6 text-sm font-semibold tracking-tight">
          Entidades que sólo lee
          <span className="ml-2 font-normal text-muted-foreground">{leidas.length}</span>
        </h3>
        <dl className="mt-3 divide-y divide-border rounded-lg border border-border">
          {leidas.map((e) => (
            <div key={e.tabla} className="px-4 py-2.5 text-sm sm:flex sm:gap-4">
              <dt className="font-mono text-xs sm:w-56 sm:shrink-0">{e.tabla}</dt>
              <dd className="text-muted-foreground">{e.rol}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section>
        <h3 className="text-sm font-semibold tracking-tight">
          Pantallas
          <span className="ml-2 font-normal text-muted-foreground">
            {manifiesto.pantallas.length}
          </span>
        </h3>
        <div className="mt-3 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Título</th>
                <th className="px-3 py-2">Ruta</th>
                <th className="px-3 py-2">Molde</th>
                <th className="px-3 py-2">Cómo se llega</th>
              </tr>
            </thead>
            <tbody>
              {manifiesto.pantallas.map((p) => (
                <tr key={p.ruta} className="border-t border-border">
                  <td className="px-3 py-2 font-medium">
                    {p.titulo}
                    {p.pertenencia === 'prestada' && (
                      <Badge variant="warning" className="ml-2 font-normal">
                        prestada
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{p.ruta}</td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className="font-normal">
                      {ETIQUETA_MOLDE[p.molde]}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {p.navegable === false
                      ? p.ruta.includes('[')
                        ? 'desde una lista'
                        : 'sin entrada en el menú'
                      : 'desde el menú'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold tracking-tight">
          Acciones del asistente
          <span className="ml-2 font-normal text-muted-foreground">
            {manifiesto.acciones.length}
          </span>
        </h3>
        <dl className="mt-3 divide-y divide-border rounded-lg border border-border">
          {manifiesto.acciones.map((a) => (
            <div key={a.clave} className="px-4 py-3 text-sm">
              <dt className="font-medium">
                {a.titulo}
                <span className="ml-2 font-mono text-[10px] font-normal text-muted-foreground">
                  {a.clave}
                </span>
                {a.requiere_confirmacion && (
                  <Badge variant="warning" className="ml-2 font-normal">
                    pide confirmación
                  </Badge>
                )}
              </dt>
              <dd className="mt-0.5 text-muted-foreground">{a.descripcion}</dd>
            </div>
          ))}
        </dl>
      </section>

      {manifiesto.configurable && manifiesto.configurable.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold tracking-tight">Qué se puede configurar</h3>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Lo que cambia entre proyectos sin tocar la pieza. Es lo que separa un
            pool de una copia.
          </p>
          <dl className="mt-3 divide-y divide-border rounded-lg border border-border">
            {manifiesto.configurable.map((c) => (
              <div key={c.clave} className="flex items-baseline justify-between gap-4 px-4 py-2.5 text-sm">
                <dt>
                  {c.etiqueta}
                  <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                    {c.clave}
                  </span>
                </dt>
                <dd className="shrink-0 text-muted-foreground">{String(c.default)}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </div>
  )
}
