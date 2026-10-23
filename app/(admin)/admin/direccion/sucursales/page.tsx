import Link from 'next/link'
import { AlertTriangle, TrendingDown, TrendingUp } from 'lucide-react'

import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { formatARS } from '@/lib/utils/format'
import { PageHeader } from '@/components/shared/page-header'
import { Badge } from '@/components/ui/badge'
import {
  contraSiMismas, comparables, malRepartido, loQueFaltaParaComparar,
} from '@/lib/direccion/lectura'

import { TABS_DIRECCION } from '../_nav'
import { MalRepartidoClient } from './mal-repartido'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Comparar sucursales' }

/**
 * D · COMPARAR LAS SUCURSALES.
 *
 * ── LA DECISIÓN QUE ORDENA LA PANTALLA ──────────────────────────────────────
 *
 * Guzmán tiene el 57,4% del stock de la cadena y el 73,3% del consumo. Arabia
 * el 3,8% y el 2,1%. Un ranking por volumen va a decir todos los meses lo
 * mismo —Guzmán primero, Arabia última— y no informa nada: es la foto del
 * tamaño de cada local, no de cómo trabaja.
 *
 * Así que hay dos secciones y no una:
 *
 *   · **Cada una contra sí misma**, mes contra su propio mes anterior.
 *   · **Entre ellas, sólo los ratios**: rotación, margen y venta por persona.
 *
 * Y ahí aparece lo que el volumen tapa: Guzmán rota primera y tiene el tercer
 * margen; Arabia rota última y tiene el segundo. Eso es información.
 *
 * ── LO QUE FALTA VA ARRIBA ──────────────────────────────────────────────────
 *
 * `gastos_operativos` tiene cero filas. Sin alquiler, sueldos y servicios la
 * pregunta «cuál gana» no tiene respuesta, y la columna «deja» es margen
 * bruto. Eso va antes de la tabla, no al pie: al pie alguien lee «deja» como
 * ganancia y decide cerrar una sucursal.
 */
export default async function CompararSucursalesPage() {
  await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente'] })
  const adm = createAdminClient()

  const [meses, ratios, reparto, falta] = await Promise.all([
    contraSiMismas(adm, 6),
    comparables(adm),
    malRepartido(adm, 400),
    loQueFaltaParaComparar(adm),
  ])

  // Agrupado por sucursal para la sección «contra sí misma».
  const porSuc = new Map<string, typeof meses extends null ? never : NonNullable<typeof meses>>()
  for (const m of meses ?? []) {
    const arr = porSuc.get(m.sucursal) ?? []
    arr.push(m)
    porSuc.set(m.sucursal, arr)
  }

  return (
    <>
      <PageHeader
        title="Comparar sucursales"
        description="Cada una contra sí misma, y entre ellas sólo lo que no depende del tamaño."
        breadcrumbs={[{ label: 'Dirección', href: '/admin/direccion' }, { label: 'Sucursales' }]}
        tabs={TABS_DIRECCION}
      />
      <div className="space-y-6 p-4 md:p-6">
        {/* ── D.5 · LO QUE FALTA, ARRIBA ───────────────────────────────── */}
        {!!falta?.length && (
          <section className="space-y-2 rounded-lg border-2 border-dashed p-4">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold">
              <AlertTriangle className="size-4" />
              Lo que falta para comparar de verdad
            </h2>
            <ul className="space-y-1.5">
              {falta.map((f, i) => (
                <li key={i} className="text-xs leading-snug">
                  <b>{f.que}:</b>{' '}
                  <span className="tabular-nums">{f.cuantos.toLocaleString('es-AR')}</span>
                  {f.cuantos === 0 && <span className="text-muted-foreground"> (ninguno)</span>}
                  {' — sin esto no se puede '}
                  {f.sin_esto_no_se_puede}{' '}
                  <Link href={f.href} className="underline decoration-dotted underline-offset-2">
                    {f.que_lo_enciende}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="text-[11px] leading-snug text-muted-foreground">
              Esto va <b>arriba y no al pie</b>: al pie, la columna «deja» se lee como ganancia y
              alguien decide cerrar una sucursal con un número que no incluye el alquiler.
            </p>
          </section>
        )}

        {/* ── D.3 · LAS TRES COMPARACIONES QUE SÍ TIENEN SENTIDO ───────── */}
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Lo que sí se puede comparar entre ellas
          </h2>
          <p className="text-[11px] leading-snug text-muted-foreground">
            Rotación, margen y venta por persona son <b>ratios</b>: no dependen del tamaño del
            local. El volumen está a la derecha como contexto, no como comparación.
          </p>

          {ratios === null ? (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              No se pudieron leer los ratios.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-xs">
                <thead className="border-b bg-muted/40">
                  <tr className="text-left [&>th]:px-3 [&>th]:py-2 [&>th]:font-medium">
                    <th>Sucursal</th>
                    <th className="text-right">Cobertura</th>
                    <th className="text-right">Margen</th>
                    <th className="text-right">Venta por persona</th>
                    <th className="border-l text-right text-muted-foreground">% del stock</th>
                    <th className="text-right text-muted-foreground">% del consumo</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {ratios.map((r) => (
                    <tr key={r.sucursal_id} className="[&>td]:px-3 [&>td]:py-2">
                      <td className="font-medium">{r.sucursal}</td>
                      <td className="text-right tabular-nums">
                        {r.cobertura_meses === null ? '—' : `${r.cobertura_meses} m`}
                        <Badge variant="outline" className="ml-1 text-[10px]">
                          {r.posicion_rotacion}º
                        </Badge>
                      </td>
                      <td className="text-right tabular-nums">
                        {r.margen_pct === null ? '—' : `${r.margen_pct}%`}
                        <Badge variant="outline" className="ml-1 text-[10px]">
                          {r.posicion_margen}º
                        </Badge>
                      </td>
                      <td className="text-right tabular-nums">
                        {r.venta_por_persona === null ? (
                          <span className="text-muted-foreground">no se puede</span>
                        ) : (
                          formatARS(r.venta_por_persona, 0)
                        )}
                      </td>
                      <td className="border-l text-right tabular-nums text-muted-foreground">
                        {r.pct_del_stock === null ? '—' : `${r.pct_del_stock}%`}
                      </td>
                      <td className="text-right tabular-nums text-muted-foreground">
                        {r.pct_del_consumo === null ? '—' : `${r.pct_del_consumo}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Lo que el volumen tapaba, dicho. */}
          {!!ratios?.length && (() => {
            const mejorRota = ratios.find((r) => r.posicion_rotacion === 1)
            const mejorMargen = ratios.find((r) => r.posicion_margen === 1)
            if (!mejorRota || !mejorMargen || mejorRota.sucursal_id === mejorMargen.sucursal_id) {
              return null
            }
            return (
              <p className="rounded-lg border p-3 text-xs leading-snug">
                <b>{mejorRota.sucursal} rota mejor que las demás</b> ({mejorRota.cobertura_meses}{' '}
                meses de cobertura) pero queda {mejorRota.posicion_margen}ª en margen
                ({mejorRota.margen_pct}%). <b>{mejorMargen.sucursal}</b> tiene el mejor margen
                ({mejorMargen.margen_pct}%) y rota {mejorMargen.posicion_rotacion}ª. Un ranking
                por volumen no muestra ninguna de las dos cosas.
              </p>
            )
          })()}

          {!!ratios?.length && ratios[0].que_no_se_puede_comparar && (
            <p className="text-[11px] leading-snug text-muted-foreground">
              {ratios[0].que_no_se_puede_comparar}.
            </p>
          )}
        </section>

        {/* ── D.1 y D.2 · CADA UNA CONTRA SÍ MISMA ────────────────────── */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Cada una contra sí misma
          </h2>
          <p className="text-[11px] leading-snug text-muted-foreground">
            <b>Arabia nunca va a vender como Guzmán.</b> Lo que importa es si cada una está mejor
            o peor que su propio mes anterior.
          </p>

          {meses === null ? (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              No se pudo leer la serie por sucursal.
            </p>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {[...porSuc.entries()].map(([nombre, filas]) => (
                <div key={nombre} className="space-y-2 rounded-lg border p-3">
                  <h3 className="text-sm font-medium">{nombre}</h3>
                  <div className="divide-y">
                    {filas.map((m) => (
                      <div
                        key={m.periodo}
                        className="flex flex-wrap items-baseline gap-x-2 py-1.5 text-xs"
                      >
                        <span className="w-16 tabular-nums text-muted-foreground">{m.periodo}</span>
                        <span className="w-28 text-right font-medium tabular-nums">
                          {formatARS(m.venta_estimada, 0)}
                        </span>
                        <span className="w-14 text-right tabular-nums text-muted-foreground">
                          {m.margen_pct === null ? '—' : `${m.margen_pct}%`}
                        </span>

                        {m.parcial ? (
                          <Badge variant="outline" className="text-[10px]">
                            a medio cargar
                          </Badge>
                        ) : m.variacion_venta_pct === null ? (
                          <span className="text-[11px] text-muted-foreground">
                            sin mes anterior
                          </span>
                        ) : (
                          <span
                            className={`flex items-center gap-0.5 font-medium tabular-nums ${
                              m.variacion_venta_pct > 0
                                ? 'text-emerald-600 dark:text-emerald-500'
                                : m.variacion_venta_pct < 0
                                  ? 'text-destructive'
                                  : ''
                            }`}
                          >
                            {m.variacion_venta_pct > 0 ? (
                              <TrendingUp className="size-3" />
                            ) : (
                              <TrendingDown className="size-3" />
                            )}
                            {m.variacion_venta_pct > 0 ? '+' : ''}
                            {m.variacion_venta_pct}%
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                  {/* El motivo por el que un mes no se compara, dicho una vez. */}
                  {(() => {
                    const conMotivo = filas.find((m) => m.que_no_se_puede_comparar)
                    return conMotivo ? (
                      <p className="border-t pt-1.5 text-[11px] leading-snug text-muted-foreground">
                        {conMotivo.que_no_se_puede_comparar}
                      </p>
                    ) : null
                  })()}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── D.4 · LO MAL REPARTIDO ──────────────────────────────────── */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Lo mal repartido
          </h2>
          <p className="text-[11px] leading-snug text-muted-foreground">
            Productos que faltan en una sucursal y sobran en otra. Mover antes de comprar no es una
            optimización: la plata ya está gastada.
          </p>
          <MalRepartidoClient filas={reparto} />
        </section>
      </div>
    </>
  )
}
