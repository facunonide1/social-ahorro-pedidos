import { notFound } from 'next/navigation'

import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/server'
import { traerProyecto } from '@/lib/fabrica/datos'
import { verificarEspejo } from '@/lib/fabrica/comparador'
import { MANIFIESTOS } from '@/lib/fabrica/manifiestos'
import { BotonRevertir, EditorDeclaracion } from '@/components/fabrica/editor-declaracion'
import { historial, manifiestoVigente } from '@/lib/fabrica/versiones'
import { estadoDelLector } from '@/lib/fabrica/flag'
import { ETIQUETA_MOLDE, type Participacion, type TipoDiferencia } from '@/lib/fabrica/tipos'

export const dynamic = 'force-dynamic'

const ETIQUETA_PARTICIPACION: Record<Participacion, string> = {
  sugiere: 'sugiere',
  prepara: 'prepara y espera',
  informa: 'avisa al equipo',
  hace_y_avisa: 'lo hace y avisa',
  nunca: 'nunca',
}

const VARIANTE_PARTICIPACION: Record<
  Participacion,
  'outline' | 'info' | 'secondary' | 'warning' | 'destructive'
> = {
  sugiere: 'outline',
  prepara: 'info',
  informa: 'secondary',
  hace_y_avisa: 'warning',
  nunca: 'destructive',
}

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

  // Se muestra y se verifica el manifiesto que GOBIERNA, no la semilla del
  // repo: desde v0.63 quien manda es la fila de la base.
  const vigente = await manifiestoVigente(params.clave)
  const manifiesto = vigente?.manifiesto ?? entrada.manifiesto
  const { prefijos } = entrada
  const verificacion = await verificarEspejo(manifiesto, prefijos, createClient(), entrada.excluir)

  const versiones = await historial(params.clave)
  const estados = await estadoDelLector(proyecto.id)
  const gobernando = estados.find((e) => e.clave === params.clave)?.lector === 'prendido'

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
          nunca el código del sector.
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

      {/* ── Editar la declaración ─────────────────────────────────────── */}
      <section>
        <h3 className="text-sm font-semibold tracking-tight">La declaración</h3>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Cambiar un título acá crea una versión nueva. La anterior no se toca:
          queda en el historial y se puede volver a ella de un toque.
        </p>
        <div className="mt-3">
          <EditorDeclaracion
            slug={proyecto.slug}
            clave={params.clave}
            gobernando={gobernando}
            pantallas={manifiesto.pantallas.map((p) => ({
              ruta: p.ruta,
              titulo: p.titulo,
              dinamico: p.titulo_dinamico === true,
            }))}
          />
        </div>
      </section>

      {/* ── Historial ─────────────────────────────────────────────────── */}
      <section>
        <h3 className="text-sm font-semibold tracking-tight">
          Historial
          <span className="ml-2 font-normal text-muted-foreground">{versiones.length}</span>
        </h3>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Ninguna versión se edita ni se borra. Revertir crea una versión nueva
          con el contenido de la vieja: si borrara la mala, se perdería el
          registro de que existió y de qué rompió.
        </p>
        <div className="mt-3 divide-y divide-border rounded-lg border border-border">
          {versiones.map((v) => {
            const vuelveA = v.revierteA ? versiones.find((x) => x.id === v.revierteA)?.numero : null
            return (
              <div key={v.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
                <span className="w-14 shrink-0 text-sm font-semibold tabular-nums">v{v.numero}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {v.esActual && (
                      <Badge variant="success" className="font-normal">gobierna hoy</Badge>
                    )}
                    {vuelveA != null && (
                      <Badge variant="outline" className="font-normal">vuelve a la v{vuelveA}</Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {String(v.creadaAt).slice(0, 16).replace('T', ' ')}
                    </span>
                  </div>
                  <p className="mt-1 text-sm">{v.motivo ?? 'sin motivo registrado'}</p>
                </div>
                {!v.esActual && (
                  <BotonRevertir
                    slug={proyecto.slug}
                    clave={params.clave}
                    versionId={v.id}
                    numero={v.numero}
                  />
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* ── Agentes ───────────────────────────────────────────────────── */}
      <section>
        <h3 className="text-sm font-semibold tracking-tight">
          Agentes
          <span className="ml-2 font-normal text-muted-foreground">
            {(manifiesto.agentes ?? []).length}
          </span>
        </h3>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          La unidad que ve el cliente. El agente posee decisiones y
          automatizaciones, no pantallas ni entidades: ésas son compartidas.
        </p>

        {(manifiesto.agentes ?? []).length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
            Este pool no aporta ningún agente. Es una respuesta válida: significa
            que el sector no automatiza ni decide nada por su cuenta todavía.
          </p>
        ) : (
          <div className="mt-3 space-y-4">
            {(manifiesto.agentes ?? []).map((ag) => (
              <div key={ag.clave} className="rounded-lg border border-border">
                <div className="border-b border-border p-4">
                  <h4 className="font-medium tracking-tight">
                    {ag.nombre}
                    <span className="ml-2 font-mono text-[10px] font-normal text-muted-foreground">
                      {ag.clave}
                    </span>
                  </h4>
                  <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{ag.trabajo}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {ag.capacidades.map((c) => (
                      <Badge key={c} variant="outline" className="font-normal">{c}</Badge>
                    ))}
                  </div>
                </div>

                <div className="border-b border-border p-4">
                  <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Qué necesita para funcionar
                  </h5>
                  <ul className="mt-2 space-y-1.5 text-sm">
                    {ag.necesita.map((r) => (
                      <li key={r.dato} className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-medium">{r.dato}</span>
                        {r.donde && (
                          <span className="text-xs text-muted-foreground">· {r.donde}</span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          — sin esto: {r.sin_esto}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {ag.se_activa_con && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Se enciende con: {ag.se_activa_con}
                    </p>
                  )}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2">Acción</th>
                        <th className="px-4 py-2">Cuánto hace solo</th>
                        <th className="px-4 py-2">Por qué</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ag.acciones.map((acc) => (
                        <tr key={acc.clave} className="border-t border-border align-top">
                          <td className="px-4 py-2">
                            {acc.titulo}
                            <div className="font-mono text-[10px] text-muted-foreground">
                              {acc.clave}
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-2">
                            <Badge
                              variant={VARIANTE_PARTICIPACION[acc.participacion]}
                              className="font-normal"
                            >
                              {ETIQUETA_PARTICIPACION[acc.participacion]}
                            </Badge>
                            {acc.participacion === 'hace_y_avisa' && acc.reversible === false && (
                              <div className="mt-1 text-[10px] font-medium text-warning">
                                actúa solo y no se puede deshacer
                              </div>
                            )}
                            {acc.compromete_tercero && (
                              <div className="mt-1 text-[10px] text-muted-foreground">
                                sale del equipo
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-2 text-muted-foreground">
                            {acc.motivo ?? '—'}
                            {acc.brecha && (
                              <div className="mt-1.5 rounded border border-warning/40 bg-warning/10 px-2 py-1 text-[11px] text-foreground">
                                <span className="font-medium">El código todavía no lo cumple:</span>{' '}
                                {acc.brecha}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
                  Techo de permisos:{' '}
                  {ag.permisos.map((p) => `${p.modulo} (${p.acciones.join(', ')})`).join(' · ')}
                  {' — '}nunca más que quien lo creó.
                </div>
              </div>
            ))}
          </div>
        )}
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
