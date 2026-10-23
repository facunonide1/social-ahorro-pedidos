import { AlertTriangle, Info } from 'lucide-react'

import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { formatARS } from '@/lib/utils/format'
import { PageHeader } from '@/components/shared/page-header'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { LoQueNoSeSabe } from '@/components/shared/numero-grande'
import {
  recargoVsComision, resultadoPorMes, loQueNoSePuedeCalcular,
  noConvieneResumen, ventasExtremas,
} from '@/lib/canales/lectura'

import { TABS_CANALES, ROLES_CANAL } from '../_nav'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Cuánto deja cada canal' }

/**
 * A.1 y A.2 · CUÁNTO DEJA CADA CANAL, Y SI EL RECARGO ALCANZA.
 *
 * ── LA CUENTA QUE ESTA PANTALLA EXISTE PARA MOSTRAR ─────────────────────────
 *
 * Con 24% de comisión, un recargo del 24% **no empata al mostrador**. La
 * comisión se cobra sobre el precio ya recargado, así que de $124 la
 * plataforma se lleva $29,76 y quedan $94,24 — menos que los $100 del
 * mostrador. El recargo que empata es `r = c / (1 − c)` = 31,6%.
 *
 * Importa porque la brecha de PedidosYa no es «19 contra 24, faltan 5»: es
 * «19 contra 31,6, faltan 12,6». La diferencia entre las dos lecturas es si
 * subir el recargo 5 puntos resuelve el problema. No lo resuelve.
 *
 * Por eso la pantalla muestra los tres números y la cuenta escrita, en vez de
 * la conclusión sola: una conclusión sin la cuenta no se puede discutir.
 */
export default async function ResultadoDeCanalesPage() {
  await requireAdminHubAccess({ allowedRoles: [...ROLES_CANAL] })
  const adm = createAdminClient()

  const [recargos, meses, noSePuede, noConviene, extremas] = await Promise.all([
    recargoVsComision(adm),
    resultadoPorMes(adm, 12),
    loQueNoSePuedeCalcular(adm),
    noConvieneResumen(adm),
    ventasExtremas(adm),
  ])

  return (
    <>
      <PageHeader
        title="Cuánto deja cada canal"
        description="Lo que queda después de la comisión, contra lo que dejaría la misma venta en el mostrador."
        breadcrumbs={[{ label: 'Canales', href: '/admin/canales' }, { label: 'Cuánto deja' }]}
        tabs={TABS_CANALES}
      />
      <div className="space-y-6 p-4 md:p-6">
        {/* ── A.2 · EL RECARGO CONTRA LA COMISIÓN ──────────────────────── */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            El recargo contra la comisión
          </h2>

          {recargos === null ? (
            <Alert variant="destructive">
              <AlertTriangle className="size-4" />
              <AlertDescription className="text-sm leading-snug">
                <b>No se pudo leer el recargo de los canales.</b> No significa que esté bien:
                significa que la consulta falló y no se sabe.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-3">
              {recargos.map((r) => {
                const brechaReal =
                  r.recargo_que_haria_falta === null
                    ? null
                    : Math.round((r.recargo_que_haria_falta - r.recargo_pct) * 10) / 10

                return (
                  <div
                    key={r.canal_id}
                    className={`rounded-lg border p-4 ${r.cubre ? '' : 'border-destructive'}`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{r.canal}</span>
                      {!r.cubre && (
                        <Badge variant="destructive" className="text-[10px]">
                          el recargo no cubre la comisión
                        </Badge>
                      )}
                      {/* El disclaimer, visible y no al pie. */}
                      {!r.comision_confirmada && (
                        <Badge variant="outline" className="text-[10px]">
                          comisión sin confirmar
                        </Badge>
                      )}
                    </div>

                    {/* Los tres números, uno al lado del otro. */}
                    <div className="mt-3 grid gap-3 text-sm sm:grid-cols-4">
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          recargo que cobra
                        </p>
                        <p className="text-xl font-semibold tabular-nums">{r.recargo_pct}%</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          comisión que paga
                        </p>
                        <p className="text-xl font-semibold tabular-nums">{r.comision_pct}%</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          recargo que haría falta
                        </p>
                        <p className="text-xl font-semibold tabular-nums">
                          {r.recargo_que_haria_falta === null
                            ? '—'
                            : `${r.recargo_que_haria_falta}%`}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          brecha real
                        </p>
                        <p
                          className={`text-xl font-semibold tabular-nums ${
                            brechaReal && brechaReal > 0 ? 'text-destructive' : ''
                          }`}
                        >
                          {brechaReal === null
                            ? '—'
                            : brechaReal <= 0
                              ? 'ninguna'
                              : `${brechaReal} pts`}
                        </p>
                      </div>
                    </div>

                    {/* LA CUENTA, escrita. No la conclusión sola. */}
                    {!r.cubre && r.recargo_que_haria_falta !== null && (
                      <div className="mt-3 rounded border bg-muted/40 p-3">
                        <p className="font-mono text-[11px] leading-relaxed">
                          r = c / (1 − c) = {r.comision_pct}% / (1 − {r.comision_pct / 100}) ={' '}
                          <b>{r.recargo_que_haria_falta}%</b>
                        </p>
                        <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
                          Con un recargo del {r.comision_pct}% el precio sería{' '}
                          {formatARS(100 + r.comision_pct, 0)} y la plataforma se llevaría{' '}
                          {formatARS(((100 + r.comision_pct) * r.comision_pct) / 100, 0)}: quedan{' '}
                          {formatARS(
                            100 + r.comision_pct - ((100 + r.comision_pct) * r.comision_pct) / 100,
                            0,
                          )}{' '}
                          de los $100 del mostrador. <b>La comisión se cobra sobre el precio ya
                          recargado</b>, y por eso igualar la comisión no alcanza.
                        </p>
                        <p className="mt-1.5 text-[11px] leading-snug">
                          La brecha contra el recargo nominal es de{' '}
                          <b>{Math.abs(r.diferencia_pts)} puntos</b>. La brecha que importa —contra
                          el recargo que empata— es de <b>{brechaReal} puntos</b>.
                        </p>
                      </div>
                    )}

                    <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
                      {r.hecho}
                    </p>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* ── A.1 · EL RESULTADO POR MES ───────────────────────────────── */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            El resultado, mes por mes
          </h2>

          {meses === null ? (
            <Alert variant="destructive">
              <AlertTriangle className="size-4" />
              <AlertDescription className="text-sm">
                No se pudo leer el resultado por canal.
              </AlertDescription>
            </Alert>
          ) : !meses.length ? (
            <p className="rounded-lg border border-dashed p-4 text-sm leading-snug text-muted-foreground">
              <b>Ningún canal tiene pedidos con costo cargado.</b> No es que no vendan: es que no
              hay con qué calcular el resultado. Lo enciende que el costo entre con el maestro de
              SIFACO o con las facturas de compra.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-xs">
                <thead className="border-b bg-muted/40">
                  <tr className="text-left [&>th]:px-3 [&>th]:py-2 [&>th]:font-medium">
                    <th>Mes</th>
                    <th>Canal</th>
                    <th className="text-right">Pedidos</th>
                    <th className="text-right">Venta</th>
                    <th className="text-right">Comisión</th>
                    <th className="text-right">Costo</th>
                    <th className="text-right">Resultado</th>
                    <th className="text-right">%</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {meses.map((m, i) => (
                    <tr key={i} className="[&>td]:px-3 [&>td]:py-2">
                      <td className="tabular-nums">{m.mes}</td>
                      <td>{m.canal}</td>
                      <td className="text-right tabular-nums">{m.pedidos}</td>
                      <td className="text-right tabular-nums">{formatARS(m.venta, 0)}</td>
                      <td className="text-right tabular-nums">{formatARS(m.comision, 0)}</td>
                      <td className="text-right tabular-nums">{formatARS(m.costo, 0)}</td>
                      <td className="text-right font-medium tabular-nums">
                        {formatARS(m.resultado, 0)}
                      </td>
                      <td className="text-right tabular-nums">
                        {m.resultado_pct === null ? '—' : `${m.resultado_pct}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Cada fila trae qué no se sabe, y acá se muestra entero. */}
          {!!meses?.length && (
            <ul className="space-y-1.5">
              {meses
                .filter((m) => m.que_no_se_sabe)
                .map((m, i) => (
                  <li
                    key={i}
                    className="flex gap-1.5 text-[11px] leading-snug text-muted-foreground"
                  >
                    <Info className="mt-0.5 size-3 shrink-0" />
                    <span>
                      <b>
                        {m.canal} · {m.mes}:
                      </b>{' '}
                      {m.que_no_se_sabe}
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </section>

        {/* ── LAS VENTAS QUE NO SON VENTAS ─────────────────────────────── */}
        {!!extremas?.length && (
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Los pedidos que quedaron afuera del total
            </h3>
            <p className="text-[11px] leading-snug text-muted-foreground">
              No se borraron: están acá. Se separaron del total porque se salen de lo habitual del
              canal, y un pedido de corrección metido en la venta del mes desarma el mes entero.
            </p>
            <div className="divide-y rounded-lg border">
              {extremas.map((e: any, i: number) => (
                <div key={i} className="flex flex-wrap items-baseline gap-x-2 px-3 py-2 text-xs">
                  <span className="tabular-nums text-muted-foreground">{e.fecha}</span>
                  <span className="font-medium">{e.canal}</span>
                  <span className="font-semibold tabular-nums">{formatARS(e.total, 0)}</span>
                  <span className="leading-snug text-muted-foreground">{e.por_que}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── LO QUE NO CONVIENE, RESUMIDO ─────────────────────────────── */}
        {!!noConviene?.length && (
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Lo que dejaría menos que el mostrador
            </h3>
            <div className="divide-y rounded-lg border">
              {noConviene.map((n: any, i: number) => (
                <div key={i} className="px-3 py-2.5 text-xs">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-medium">{n.canal}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {n.medido_o_proyectado}
                    </Badge>
                    <span className="tabular-nums">
                      {Number(n.productos).toLocaleString('es-AR')} productos
                    </span>
                    {Number(n.pierden_plata) > 0 && (
                      <span className="font-medium tabular-nums text-destructive">
                        {Number(n.pierden_plata).toLocaleString('es-AR')} pierden plata
                      </span>
                    )}
                  </div>
                  <p className="mt-1 leading-snug text-muted-foreground">{n.el_supuesto}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── C.7 · LO QUE NO SE PUEDE CALCULAR ────────────────────────── */}
        <LoQueNoSeSabe
          titulo="Lo que no se puede calcular todavía"
          items={(noSePuede ?? []).map((n) => ({
            que: n.que,
            cuantos: n.cuantos,
            que_lo_enciende: n.que_lo_enciende,
          }))}
        />
      </div>
    </>
  )
}
