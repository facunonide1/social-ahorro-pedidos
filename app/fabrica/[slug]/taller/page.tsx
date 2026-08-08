import { notFound } from 'next/navigation'

import { Badge } from '@/components/ui/badge'
import { BotonPanico } from '@/components/fabrica/controles-lector'
import { BotonVerificar, DecidirPropuesta } from '@/components/fabrica/controles-taller'
import { ChatTaller } from '@/components/fabrica/chat-taller'
import { puedeArmar, requireFabricaAccess } from '@/lib/fabrica/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { traerProyecto } from '@/lib/fabrica/datos'
import { estadoDelLector } from '@/lib/fabrica/flag'
import { ETIQUETA_CARRIL, ETIQUETA_TIPO, HABILITABLES, type Carril } from '@/lib/fabrica/carriles'
import {
  expirarVencidas,
  listarPropuestas,
  salud,
  type EstadoPropuesta,
} from '@/lib/fabrica/propuestas'
import { ultimasVerificaciones, verificarLoQueHagaFalta } from '@/lib/fabrica/verificador'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Taller' }

const ICONO: Record<Carril, string> = { verde: '🟢', amarillo: '🟡', rojo: '🔴' }
const VARIANTE_CARRIL: Record<Carril, 'success' | 'warning' | 'destructive'> = {
  verde: 'success',
  amarillo: 'warning',
  rojo: 'destructive',
}
const VARIANTE_ESTADO: Record<EstadoPropuesta, 'outline' | 'success' | 'secondary' | 'warning'> = {
  pendiente: 'outline',
  aplicada: 'success',
  rechazada: 'secondary',
  revertida: 'warning',
  expirada: 'secondary',
}

export default async function TallerPage({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams: { carril?: string; estado?: string; pool?: string }
}) {
  const proyecto = await traerProyecto(params.slug)
  if (!proyecto) notFound()
  const acceso = await requireFabricaAccess()

  // Chequeo perezoso, igual que el resto del proyecto: no hay cron, y simular
  // que algo corre solo es peor que decir cuándo corre.
  const expiradas = await expirarVencidas(proyecto.id)
  const verificados = await verificarLoQueHagaFalta(proyecto.id)

  const [propuestas, estados, ultimas] = await Promise.all([
    listarPropuestas(proyecto.id),
    estadoDelLector(proyecto.id),
    ultimasVerificaciones(proyecto.id),
  ])
  const s = salud(propuestas)

  const adm = createAdminClient()
  const { data: habilitados } = await adm
    .from('fab_carriles_habilitados')
    .select('tipo_campo')
    .eq('proyecto_id', proyecto.id)
  const verdes = new Set(((habilitados ?? []) as { tipo_campo: string }[]).map((h) => h.tipo_campo))

  const filtradas = propuestas.filter(
    (p) =>
      (!searchParams.carril || p.carril === searchParams.carril) &&
      (!searchParams.estado || p.estado === searchParams.estado) &&
      (!searchParams.pool || p.poolClave === searchParams.pool),
  )
  const prohibidas = propuestas.filter((p) => p.carril === 'rojo')
  const activos = estados.filter((e) => e.lector !== 'apagado')

  return (
    <div className="space-y-8 p-4 md:p-6">
      {/* ── Los carriles ──────────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold tracking-tight">El Taller</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Acá se decide qué se aplica solo, qué necesita firma y qué está
          prohibido. El carril <span className="font-medium">se deriva</span> de
          qué campo se toca y de lo que el manifiesto dice sobre ese campo: nadie
          elige el carril de su propio cambio.
        </p>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          <span className="font-medium">Hoy todo pide firma</span>, incluso lo que
          después irá al carril verde. El verde se habilita por tipo de campo,
          a mano, cuando ya se vieron suficientes cambios de ese tipo como para
          saber que son inocuos.
        </p>

        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {(['verde', 'amarillo', 'rojo'] as const).map((c) => (
            <div key={c} className="rounded-lg border border-border p-3">
              <div className="text-sm font-medium">
                {ICONO[c]} {ETIQUETA_CARRIL[c]}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {c === 'verde' && 'Reversible, sin efecto sobre plata, permisos ni cumplimiento.'}
                {c === 'amarillo' && 'Espera decisión humana.'}
                {c === 'rojo' && 'El Taller no lo propone. Si alguien lo pide, se registra.'}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Tipo de campo</th>
                <th className="px-3 py-2">¿Puede llegar a verde?</th>
                <th className="px-3 py-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {(Object.keys(ETIQUETA_TIPO) as (keyof typeof ETIQUETA_TIPO)[]).map((t) => (
                <tr key={t} className="border-t border-border">
                  <td className="px-3 py-2">{ETIQUETA_TIPO[t]}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {t === 'constitucional' ? 'nunca' : HABILITABLES.includes(t) ? 'sí' : 'no'}
                  </td>
                  <td className="px-3 py-2">
                    {HABILITABLES.includes(t) ? (
                      <Badge variant={verdes.has(t) ? 'success' : 'warning'} className="font-normal">
                        {verdes.has(t) ? 'verde habilitado' : 'pide firma'}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Salud ─────────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold tracking-tight">Salud del Taller</h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-4">
          {[
            ['Pendientes', s.pendientes],
            ['Aplicadas', s.aplicadas],
            ['Rechazadas', s.rechazadas],
            ['Expiradas', s.expiradas],
          ].map(([k, v]) => (
            <div key={String(k)} className="rounded-lg border border-border p-3">
              <dt className="text-xs text-muted-foreground">{k}</dt>
              <dd className="mt-0.5 text-2xl font-semibold tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-sm text-muted-foreground">
          {s.horasHastaDecision === null
            ? 'Todavía no se decidió ninguna propuesta.'
            : `Tardan ${Math.round(s.horasHastaDecision)} h promedio en decidirse.`}
        </p>
        {s.alerta && (
          <div className="mt-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
            <span className="font-medium">El motor hace ruido. </span>
            {s.alerta} Una cola que nadie mira no es una cola, es un depósito.
          </div>
        )}
        {(expiradas > 0 || verificados.length > 0) && (
          <p className="mt-2 text-xs text-muted-foreground">
            Al abrir esta pantalla:{' '}
            {expiradas > 0 && `${expiradas} propuesta(s) expiraron. `}
            {verificados.length > 0 && `se verificó ${verificados.join(', ')}.`}
          </p>
        )}
      </section>

      {/* ── Verificación ──────────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold tracking-tight">Verificación</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          No depende de que alguien navegue. Corre sola al abrir esta pantalla si
          hace más de un día que no corre, y a pedido con el botón. No hay cron:
          el plan del entorno no da crons finos, y simular que corre solo sería
          peor que decir cuándo corre.
        </p>
        {activos.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
            Ningún pool activo. Con el lector apagado no hay nada que verificar —
            y eso no es estar bien, es estar sin verificar.
          </p>
        ) : (
          <div className="mt-3 divide-y divide-border rounded-lg border border-border">
            {activos.map((e) => {
              const u = ultimas.get(e.clave)
              const viejo = u?.dias != null && u.dias > 2
              return (
                <div key={e.clave} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{e.nombre}</span>
                      <Badge variant="outline" className="font-normal">{e.lector}</Badge>
                      {u && u.diferencias > 0 && (
                        <Badge variant="warning" className="font-normal">
                          {u.diferencias} problema(s)
                        </Badge>
                      )}
                      {viejo && (
                        <Badge variant="warning" className="font-normal">
                          hace {u!.dias} días
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {u
                        ? `${u.verificadas}/${u.declaradas} pantallas · última corrida ${String(u.corridaAt).slice(0, 16).replace('T', ' ')} (${u.origen})`
                        : 'Nunca se verificó.'}
                    </p>
                  </div>
                  <BotonVerificar slug={proyecto.slug} clave={e.clave} />
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ── El chat ───────────────────────────────────────────────────── */}
      {/* Antes de la cola, no después: se conversa y se ve caer la propuesta. */}
      <ChatTaller slug={proyecto.slug} puedeProponer={puedeArmar(acceso, proyecto.id)} />

      {/* ── La cola ───────────────────────────────────────────────────── */}
      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold tracking-tight">
            Propuestas
            <span className="ml-2 font-normal text-muted-foreground">{filtradas.length}</span>
          </h2>
          <div className="flex flex-wrap gap-1 text-xs">
            <Filtro slug={proyecto.slug} etiqueta="todas" activo={!searchParams.carril && !searchParams.estado} />
            {(['verde', 'amarillo', 'rojo'] as const).map((c) => (
              <Filtro
                key={c}
                slug={proyecto.slug}
                query={`carril=${c}`}
                etiqueta={`${ICONO[c]} ${ETIQUETA_CARRIL[c]}`}
                activo={searchParams.carril === c}
              />
            ))}
            <Filtro slug={proyecto.slug} query="estado=pendiente" etiqueta="pendientes" activo={searchParams.estado === 'pendiente'} />
          </div>
        </div>

        {filtradas.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
            Nada acá. Las propuestas salen del editor de una declaración o del
            verificador cuando encuentra una diferencia.
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            {filtradas.map((p) => (
              <article key={p.id} className="rounded-lg border border-border">
                <div className="flex flex-wrap items-start gap-3 border-b border-border p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={VARIANTE_CARRIL[p.carril]} className="font-normal">
                        {ICONO[p.carril]} {ETIQUETA_CARRIL[p.carril]}
                      </Badge>
                      <Badge variant={VARIANTE_ESTADO[p.estado]} className="font-normal">
                        {p.estado}
                      </Badge>
                      <span className="font-medium">{p.poolClave}</span>
                      <span className="text-xs text-muted-foreground">
                        {String(p.creadaAt).slice(0, 16).replace('T', ' ')} · {p.origen}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{p.carrilMotivo}</p>
                  </div>
                  <DecidirPropuesta
                    slug={proyecto.slug}
                    propuestaId={p.id}
                    estado={p.estado}
                    carril={p.carril}
                  />
                </div>

                <dl className="divide-y divide-border text-sm">
                  <Campo titulo="Qué cambia">
                    {p.queCambia.length === 0 ? (
                      <span className="text-muted-foreground">Nada visible.</span>
                    ) : (
                      <ul className="space-y-1">
                        {p.queCambia.map((d, i) => (
                          <li key={i}>{d.texto}</li>
                        ))}
                      </ul>
                    )}
                  </Campo>
                  <Campo titulo="Por qué">{p.porque}</Campo>
                  <Campo titulo="A quién afecta">
                    {p.afecta.pantallas} pantalla(s) · {p.afecta.personas} persona(s) con acceso ·{' '}
                    {p.afecta.pools.join(', ')}
                  </Campo>
                  <Campo titulo="Costo de revertir">{p.costoRevertir}</Campo>
                  {p.notaDecision && <Campo titulo="Decisión">{p.notaDecision}</Campo>}
                </dl>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* ── Intentos prohibidos ───────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold tracking-tight">
          Intentos prohibidos
          <span className="ml-2 font-normal text-muted-foreground">{prohibidas.length}</span>
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Lo que cayó en carril rojo. Se muestra, no se esconde: la constitución
          visible vale más que la silenciosa.
        </p>
        {prohibidas.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
            Ninguno.
          </p>
        ) : (
          <div className="mt-3 divide-y divide-border rounded-lg border border-destructive/40">
            {prohibidas.map((p) => (
              <div key={p.id} className="px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{p.poolClave}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {p.campos.join(', ')}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {String(p.creadaAt).slice(0, 16).replace('T', ' ')}
                  </span>
                </div>
                <p className="mt-1 text-muted-foreground">{p.carrilMotivo}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <BotonPanico slug={proyecto.slug} activos={activos.length} />
    </div>
  )
}

function Campo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-2.5 sm:flex sm:gap-4">
      <dt className="text-xs font-medium text-muted-foreground sm:w-40 sm:shrink-0">{titulo}</dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  )
}

function Filtro({
  slug,
  query,
  etiqueta,
  activo,
}: {
  slug: string
  query?: string
  etiqueta: string
  activo: boolean
}) {
  return (
    <a
      href={`/fabrica/${slug}/taller${query ? `?${query}` : ''}`}
      className={
        activo
          ? 'rounded-md bg-muted px-2 py-1 font-medium text-foreground'
          : 'rounded-md px-2 py-1 text-muted-foreground hover:bg-muted/60 hover:text-foreground'
      }
    >
      {etiqueta}
    </a>
  )
}
