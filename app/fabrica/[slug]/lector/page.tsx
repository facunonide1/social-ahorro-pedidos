import { notFound } from 'next/navigation'

import { Badge } from '@/components/ui/badge'
import { BotonPanico, SelectorEstado } from '@/components/fabrica/controles-lector'
import { createClient } from '@/lib/supabase/server'
import { estadoDelLector } from '@/lib/fabrica/flag'
import {
  coberturaDe,
  corteDe,
  sombraCiega,
  ETIQUETA_VEREDICTO,
  VARIANTE_VEREDICTO,
} from '@/lib/fabrica/cobertura-lector'
import { ESTADOS_LECTOR, ETIQUETA_LECTOR, EXPLICACION_LECTOR } from '@/lib/fabrica/lector-estados'
import { informePreparacion } from '@/lib/fabrica/preparacion'
import { traerProyecto } from '@/lib/fabrica/datos'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Preparación del lector' }

export default async function LectorPage({ params }: { params: { slug: string } }) {
  const proyecto = await traerProyecto(params.slug)
  if (!proyecto) notFound()

  const informe = informePreparacion()
  const maxRiesgo = Math.max(...informe.map((p) => p.riesgo))

  const estados = await estadoDelLector(proyecto.id)
  // El veredicto de tres estados. Un pool apagado NO está "sin diferencias":
  // está sin verificar, y son cosas distintas.
  const cobertura = new Map(
    await Promise.all(
      estados.map(async (e) => [e.clave, await coberturaDe(proyecto.id, e.clave, e.lector)] as const),
    ),
  )
  const activos = estados.filter((e) => e.lector !== 'apagado')

  // Las diferencias de sombra, en detalle y legibles.
  const sb = createClient()
  const { data: eventos } = await sb
    .from('fab_lector_eventos')
    .select('pool_clave, tipo, aspecto, motivo, detalle, ocurrido_at')
    .eq('proyecto_id', proyecto.id)
    .order('ocurrido_at', { ascending: false })
    .limit(50)
  const filas = (eventos ?? []) as {
    pool_clave: string
    tipo: string
    aspecto: string
    motivo: string | null
    detalle: Record<string, unknown>
    ocurrido_at: string
  }[]
  // Mismo corte que el veredicto. Un evento anterior al último cambio de
  // declaración pudo quedar resuelto por ese cambio, y mostrarlo igual es la
  // falsa alarma que es el espejo del falso cero: entrena a ignorar la tabla.
  const cortes = new Map(
    await Promise.all(estados.map(async (e) => [e.clave, await corteDe(proyecto.id, e.clave)] as const)),
  )
  const vigente = (f: { pool_clave: string; ocurrido_at: string }) =>
    f.ocurrido_at >= (cortes.get(f.pool_clave) ?? '1970-01-01T00:00:00Z')

  const diferencias = filas.filter((f) => f.tipo === 'diferencia' && vigente(f))
  const fallbacks = filas.filter((f) => f.tipo === 'fallback' && vigente(f))
  const resueltos = filas.length - diferencias.length - fallbacks.length

  return (
    <div className="space-y-8 p-4 md:p-6">
      {/* ── Estado operativo ──────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold tracking-tight">Estado del lector</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Con el lector <span className="font-medium">apagado</span>, cada sector
          lee su definición del código: es exactamente lo de hoy. El estado se
          cambia acá y tiene efecto en la request siguiente, sin deploy.
        </p>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          <span className="font-medium">Sin verificar no es lo mismo que sin
          diferencias.</span> Un pool que nunca comparó nada no dice "0": dice que
          no miró. La verificación cuenta cuántas de sus pantallas consultaron al
          lector de verdad, detectado en tiempo de ejecución.
        </p>

        <dl className="mt-3 grid gap-2 sm:grid-cols-3">
          {ESTADOS_LECTOR.map((e) => (
            <div key={e} className="rounded-lg border border-border p-3">
              <dt className="text-xs font-medium">{ETIQUETA_LECTOR[e]}</dt>
              <dd className="mt-0.5 text-xs text-muted-foreground">{EXPLICACION_LECTOR[e]}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-4 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Pool</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Verificación</th>
                <th className="px-3 py-2 text-right">Fallbacks</th>
                <th className="px-3 py-2">Último cambio</th>
              </tr>
            </thead>
            <tbody>
              {estados.map((e) => (
                <tr key={e.clave} className="border-t border-border align-middle">
                  <td className="px-3 py-2">
                    <span className="font-medium">{e.nombre}</span>
                    <span className="ml-2 font-mono text-[10px] text-muted-foreground">{e.clave}</span>
                  </td>
                  <td className="px-3 py-2">
                    <SelectorEstado slug={proyecto.slug} clave={e.clave} actual={e.lector} />
                  </td>
                  <td className="px-3 py-2">
                    {(() => {
                      const c = cobertura.get(e.clave)!
                      const alerta = sombraCiega(c, e.lector)
                      return (
                        <>
                          <Badge variant={VARIANTE_VEREDICTO[c.veredicto]} className="font-normal">
                            {ETIQUETA_VEREDICTO[c.veredicto]}
                            {c.veredicto === 'verificado_con_diferencias' && ` · ${c.diferencias}`}
                          </Badge>
                          <div className="mt-0.5 text-[11px] text-muted-foreground">
                            {c.verificadas}/{c.gobernables} pantallas verificadas
                          </div>
                          {alerta && (
                            <div className="mt-0.5 text-[11px] font-medium text-warning">{alerta}</div>
                          )}
                        </>
                      )
                    })()}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {e.fallbacks > 0 ? (
                      <span className="font-medium text-destructive">{e.fallbacks}</span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {e.ultimoCambio
                      ? `${e.ultimoCambio.desde} → ${e.ultimoCambio.hasta} · ${String(e.ultimoCambio.cuando).slice(0, 16).replace('T', ' ')}` +
                        (e.ultimoCambio.porEmail ? ` · ${e.ultimoCambio.porEmail}` : '') +
                        (e.ultimoCambio.panico ? ' · pánico' : '')
                      : 'nunca se cambió'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Diferencias de sombra ─────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold tracking-tight">
          Diferencias en sombra
          <span className="ml-2 font-normal text-muted-foreground">{diferencias.length}</span>
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Qué habría devuelto la declaración contra qué devolvió el código. Un
          pool con diferencias no se prende: se corrige la declaración primero.
        </p>
        {resueltos > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            {resueltos} evento(s) anteriores al último cambio de declaración no
            se muestran: pudieron quedar resueltos por ese cambio.
          </p>
        )}
        {diferencias.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
            Ninguna. Los pools en sombra habrían devuelto lo mismo que el código.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Pool</th>
                  <th className="px-3 py-2">Dónde</th>
                  <th className="px-3 py-2">Dice el código</th>
                  <th className="px-3 py-2">Diría la declaración</th>
                  <th className="px-3 py-2">Cuándo</th>
                </tr>
              </thead>
              <tbody>
                {diferencias.map((d, i) => (
                  <tr key={i} className="border-t border-border align-top">
                    <td className="px-3 py-2 font-medium">{d.pool_clave}</td>
                    <td className="px-3 py-2 font-mono text-xs">{String(d.detalle.ruta ?? d.aspecto)}</td>
                    <td className="px-3 py-2">{String(d.detalle.en_codigo ?? '—')}</td>
                    <td className="px-3 py-2">
                      {d.detalle.en_declaracion === null ? (
                        <span className="text-muted-foreground">no la declara</span>
                      ) : (
                        String(d.detalle.en_declaracion ?? '—')
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                      {String(d.ocurrido_at).slice(0, 16).replace('T', ' ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Fallbacks ─────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold tracking-tight">
          Caídas al código
          <span className="ml-2 font-normal text-muted-foreground">{fallbacks.length}</span>
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Veces que el flag estaba prendido y el sector usó el código igual.{' '}
          <strong>Si este número no es cero, hay algo mal.</strong> El sector no
          se rompió —para eso está el fallback— pero la declaración no se está
          aplicando y alguien tiene que enterarse.
        </p>
        {fallbacks.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
            Ninguna.
          </p>
        ) : (
          <div className="mt-3 divide-y divide-border rounded-lg border border-border">
            {fallbacks.map((f, i) => (
              <div key={i} className="px-4 py-2.5 text-sm">
                <span className="font-medium">{f.pool_clave}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {String(f.ocurrido_at).slice(0, 16).replace('T', ' ')}
                </span>
                <p className="mt-0.5 text-muted-foreground">{f.motivo ?? 'sin motivo registrado'}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Pánico ────────────────────────────────────────────────────── */}
      <BotonPanico slug={proyecto.slug} activos={activos.length} />

      {/* ── El plan ───────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold tracking-tight">
          En qué orden prender el lector
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          El lector es la pieza que hace que la declaración <em>mande</em> sobre
          el código. No se prende en todos lados el mismo día: se prende en uno,
          se mira, y se sigue.
        </p>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          El orden es al revés de lo intuitivo. <strong>No gana el pool más
          completo: gana el que hace menos daño si la declaración está mal.</strong>{' '}
          Un pool con muchos elementos constitucionales es más peligroso
          justamente porque tiene más para romper.
        </p>
        <p className="mt-2 max-w-3xl text-xs text-muted-foreground">
          El número no es una opinión: sale de contar entidades propias,
          escritura en tablas ajenas, elementos constitucionales, acciones que
          tocan plata o salen del equipo, brechas abiertas y cuántos pools
          dependen de él.
        </p>
      </section>

      <ol className="space-y-3">
        {informe.map((p, i) => (
          <li key={p.clave} className="rounded-lg border border-border">
            <div className="flex flex-wrap items-start gap-3 border-b border-border p-4">
              <span className="grid size-7 shrink-0 place-items-center rounded-full border border-border text-xs font-semibold tabular-nums">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-medium tracking-tight">{p.nombre}</h3>
                  <span className="font-mono text-[10px] text-muted-foreground">{p.clave}</span>
                  <Badge
                    variant={p.categoria === 'nucleo' ? 'info' : 'outline'}
                    className="font-normal"
                  >
                    {p.categoria === 'nucleo' ? 'Núcleo' : 'Genérico'}
                  </Badge>
                  {p.brechas.length > 0 && (
                    <Badge variant="warning" className="font-normal">
                      {p.brechas.length} brecha abierta
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-sm">{p.veredicto}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <div className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-muted sm:block">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${(p.riesgo / maxRiesgo) * 100}%` }}
                  />
                </div>
                <span className="w-8 text-right text-lg font-semibold tabular-nums">
                  {p.riesgo}
                </span>
              </div>
            </div>

            <div className="grid gap-x-6 gap-y-1 p-4 text-xs sm:grid-cols-2">
              <div className="text-muted-foreground">
                <span className="font-medium text-foreground">De qué está hecho: </span>
                {p.factores.join(' · ') || 'nada que sumara riesgo'}
              </div>
              <div className="text-muted-foreground">
                <span className="font-medium text-foreground">Qué falta declarar: </span>
                {p.incompleto.join(' · ') || 'nada'}
              </div>
            </div>

            {p.brechas.length > 0 && (
              <div className="border-t border-border p-4">
                {p.brechas.map((b) => (
                  <p key={b} className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Brecha: </span>
                    {b}
                  </p>
                ))}
              </div>
            )}
          </li>
        ))}
      </ol>

      <section>
        <h3 className="text-sm font-semibold tracking-tight">Lo que este orden no dice</h3>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Que un pool esté primero no quiere decir que su declaración sea mejor:
          los diez están en 0 diferencias contra el código. Quiere decir que si
          igual estuviera mal, el daño se queda adentro. Compras y Centro de
          Datos van últimos porque escriben en tablas de otros pools — ahí una
          declaración equivocada sale del pool y llega a donde no la esperan.
        </p>
      </section>
    </div>
  )
}
