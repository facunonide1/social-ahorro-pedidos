import Link from 'next/link'
import { ArrowRight, Clock } from 'lucide-react'

import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { formatARS } from '@/lib/utils/format'
import { PageHeader } from '@/components/shared/page-header'
import { Badge } from '@/components/ui/badge'
import { NumeroGrande, NumerosGrandes, LoQueNoSeSabe } from '@/components/shared/numero-grande'
import {
  enJuego, negocio, porSucursal, noSeSabe, visitar, queCambio,
  type Indicador,
} from '@/lib/direccion/lectura'
import { informe } from '@/lib/deteccion/lectura'

import { TABS_DIRECCION } from './_nav'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Dirección' }

/**
 * C · EL TABLERO DEL DUEÑO.
 *
 * ── PARA QUIÉN ES ───────────────────────────────────────────────────────────
 *
 * Alguien que entra una vez por día y tiene cinco minutos. Eso define el orden
 * y define qué NO va: nada que requiera abrir otra pantalla para entenderse, y
 * nada que no termine en algo que se pueda hacer hoy.
 *
 * ── EL ORDEN, Y POR QUÉ ES ÉSTE ─────────────────────────────────────────────
 *
 * 1. **Qué cambió desde que entraste.** Lo primero, porque si entrás todos los
 *    días es lo único que no viste.
 * 2. **Lo que está en juego**, con su botón. Cinco números y cinco acciones.
 * 3. **Los números del negocio**, contra el mes anterior.
 * 4. **Lo que el sistema no sabe.** Arriba y no al pie: al pie se lee como una
 *    nota legal, arriba se lee como parte del estado.
 * 5. Cuánto deja cada sucursal.
 * 6. El informe semanal escrito.
 *
 * ── LA MITAD DE ESTOS NÚMEROS SON ESTIMADOS ─────────────────────────────────
 *
 * La venta en plata sale de `unidades × precio sugerido`: no hay ventas
 * diarias cargadas. El margen es bruto porque no hay un solo gasto fijo
 * cargado. Los dos vienen marcados «estimado», y el bloque de lo que no se
 * sabe dice qué los convertiría en medidos. Un estimado sin marca se lee como
 * caja, y alguien decide sobre plata que no existe.
 */

const ROLES = ['super_admin', 'gerente'] as const

function Numero({ titulo, ind, accion, riesgo }: {
  titulo: string
  ind: Indicador
  accion: { label: string; href: string }
  riesgo?: boolean
}) {
  return (
    <NumeroGrande
      titulo={titulo}
      valor={ind.valor}
      unidad={titulo === 'Rotación' ? 'cantidad' : 'plata'}
      de_donde={{ tipo: ind.procedencia, texto: ind.de_donde }}
      accion={accion}
      contra_anterior={
        ind.variacion_pct == null
          ? null
          : { valor: ind.variacion_pct, etiqueta: 'contra el mes anterior' }
      }
      riesgo={riesgo}
    />
  )
}

export default async function DireccionPage() {
  await requireAdminHubAccess({ allowedRoles: [...ROLES] })
  const sb = createClient()
  const adm = createAdminClient()

  // C.7 · la visita se marca con la sesión: `panel_visitar` escribe la fila de
  // `auth.uid()` y no puede escribir la de nadie más.
  const desde = await visitar(sb)

  const [juego, neg, sucs, falta, cambios, parrafos] = await Promise.all([
    enJuego(adm),
    negocio(adm),
    porSucursal(adm, 3),
    noSeSabe(adm),
    queCambio(adm, desde),
    informe(adm, { sucursal: null, rol: 'super_admin' }),
  ])

  return (
    <>
      <PageHeader
        title="Dirección"
        description="Lo que está en juego, qué cambió y cuánto deja cada sucursal. Cada número con de dónde sale y qué hacer."
        breadcrumbs={[{ label: 'Dirección' }]}
        tabs={TABS_DIRECCION}
      />
      <div className="space-y-6 p-4 md:p-6">
        {/* ── C.7 · QUÉ CAMBIÓ ─────────────────────────────────────────── */}
        <section className="space-y-2">
          <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Clock className="size-3.5" />
            {desde === null
              ? 'Es la primera vez que entrás'
              : `Qué cambió desde el ${new Date(desde).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}`}
          </h2>

          {desde === null ? (
            <p className="rounded-lg border border-dashed p-3 text-xs leading-snug text-muted-foreground">
              No hay una visita anterior con qué comparar. <b>No es que no haya cambiado nada:</b>{' '}
              es que no hay corte. Desde la próxima vez que entres, acá va lo que se movió.
            </p>
          ) : cambios === null ? (
            <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
              No se pudo leer qué cambió.
            </p>
          ) : !cambios.length ? (
            <p className="rounded-lg border border-dashed p-3 text-xs leading-snug">
              <b>No se movió nada desde la última vez.</b> Este cero es de verdad: se miró y no hay.
            </p>
          ) : (
            <div className="divide-y rounded-lg border">
              {cambios.map((c, i) => (
                <Link
                  key={i} href={c.href}
                  className="flex flex-wrap items-baseline gap-x-2 px-3 py-2 text-xs hover:bg-muted/50"
                >
                  <span className="font-semibold tabular-nums">
                    {c.cuantos.toLocaleString('es-AR')}
                  </span>
                  <span>{c.que}</span>
                  {c.plata !== null && c.plata > 0 && (
                    <span className="tabular-nums text-muted-foreground">
                      {formatARS(c.plata, 0)}
                    </span>
                  )}
                  <ArrowRight className="ml-auto size-3 self-center text-muted-foreground" />
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* ── C.3 · LO QUE ESTÁ EN JUEGO, CON SU BOTÓN ─────────────────── */}
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Lo que está en juego
          </h2>
          {juego === null ? (
            <p className="rounded-lg border border-dashed p-4 text-sm leading-snug text-muted-foreground">
              <b>No se pudo leer qué está en juego.</b> La consulta falló: no significa que no
              haya nada.
            </p>
          ) : (
            <NumerosGrandes columnas={5}>
              {juego.map((j) => (
                <NumeroGrande
                  key={j.clave}
                  titulo={j.titulo}
                  valor={j.plata}
                  unidad="plata"
                  detalle={
                    j.cuantos === null
                      ? undefined
                      : `${j.cuantos.toLocaleString('es-AR')} ${
                          j.clave === 'deuda' ? 'facturas' : 'ítems'
                        }`
                  }
                  de_donde={{ tipo: j.procedencia, texto: j.de_donde }}
                  accion={{ label: j.accion, href: j.href }}
                  riesgo={j.riesgo}
                />
              ))}
            </NumerosGrandes>
          )}
        </section>

        {/* ── C.2 · LOS NÚMEROS DEL NEGOCIO ───────────────────────────── */}
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            El negocio
            {neg?.periodo && (
              <span className="ml-1.5 font-normal normal-case">
                · {neg.periodo} contra {neg.periodo_anterior ?? 'nada'}
              </span>
            )}
          </h2>

          {neg === null ? (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              No se pudieron leer los números del negocio.
            </p>
          ) : (
            <>
              <NumerosGrandes columnas={3}>
                <Numero
                  titulo="Venta" ind={neg.venta}
                  accion={{ label: 'Ver por sucursal', href: '/admin/direccion/sucursales' }}
                />
                <Numero
                  titulo="Margen bruto" ind={neg.margen}
                  accion={{ label: 'Ver por sucursal', href: '/admin/direccion/sucursales' }}
                />
                <Numero
                  titulo="Caja" ind={neg.caja}
                  accion={{ label: 'Ver las cuentas', href: '/admin/finanzas' }}
                />
                <Numero
                  titulo="Deuda" ind={neg.deuda} riesgo
                  accion={{ label: 'Ver qué se debe', href: '/admin/finanzas/documentos' }}
                />
                <Numero
                  titulo="Stock al costo" ind={neg.stock}
                  accion={{ label: 'Ver el stock', href: '/admin/operaciones/stock' }}
                />
                <NumeroGrande
                  titulo="Rotación"
                  valor={neg.rotacion.valor}
                  unidad="cantidad"
                  detalle="meses de cobertura promedio · más bajo es mejor"
                  de_donde={{ tipo: neg.rotacion.procedencia, texto: neg.rotacion.de_donde }}
                  accion={{ label: 'Comparar sucursales', href: '/admin/direccion/sucursales' }}
                />
              </NumerosGrandes>

              <p className="text-[11px] leading-snug text-muted-foreground">
                <b>Lo que estos números no dicen:</b> {neg.que_no_dice}
                {neg.meses_parciales_excluidos > 0 && (
                  <>
                    {' '}
                    {neg.meses_parciales_excluidos === 1 ? 'Queda' : 'Quedan'} afuera{' '}
                    {neg.meses_parciales_excluidos}{' '}
                    {neg.meses_parciales_excluidos === 1 ? 'mes' : 'meses'} a medio cargar:
                    compararlos contra un mes entero daría una caída que no existe.
                  </>
                )}
              </p>
            </>
          )}
        </section>

        {/* ── C.5 · LO QUE EL SISTEMA NO SABE ─────────────────────────── */}
        <LoQueNoSeSabe
          items={(falta ?? []).map((f) => ({
            que: f.que, cuantos: f.cuantos,
            que_lo_enciende: f.que_lo_enciende, href: f.href,
          }))}
        />

        {/* ── C.4 · CUÁNTO DEJA CADA SUCURSAL ─────────────────────────── */}
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Cuánto deja cada sucursal
          </h2>
          {sucs === null ? (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              No se pudo leer el resultado por sucursal.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-xs">
                  <thead className="border-b bg-muted/40">
                    <tr className="text-left [&>th]:px-3 [&>th]:py-2 [&>th]:font-medium">
                      <th>Sucursal</th>
                      <th className="text-right">Venta estimada</th>
                      <th className="text-right">Deja (bruto)</th>
                      <th className="text-right">Margen</th>
                      <th className="text-right">Stock</th>
                      <th className="text-right">Cobertura</th>
                      <th>¿Gana?</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {sucs.map((s) => (
                      <tr key={s.sucursal_id} className="[&>td]:px-3 [&>td]:py-2">
                        <td className="font-medium">{s.sucursal}</td>
                        <td className="text-right tabular-nums">
                          {formatARS(s.venta_estimada, 0)}
                        </td>
                        <td className="text-right font-semibold tabular-nums">
                          {formatARS(s.deja_estimado, 0)}
                        </td>
                        <td className="text-right tabular-nums">
                          {s.margen_pct === null ? '—' : `${s.margen_pct}%`}
                        </td>
                        <td className="text-right tabular-nums">
                          {s.stock_al_costo === null ? '—' : formatARS(s.stock_al_costo, 0)}
                        </td>
                        <td className="text-right tabular-nums">
                          {s.cobertura_meses === null ? '—' : `${s.cobertura_meses} m`}
                        </td>
                        <td>
                          {s.gana_plata === null ? (
                            <Badge variant="outline" className="text-[10px]">
                              no se puede decir
                            </Badge>
                          ) : s.gana_plata ? (
                            <Badge variant="secondary" className="text-[10px]">sí</Badge>
                          ) : (
                            <Badge variant="destructive" className="text-[10px]">no</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* El límite, arriba de la tabla en importancia: sin esto la
                  columna «deja» se lee como ganancia. */}
              {!!sucs.length && sucs[0].por_que_no_se_puede_decir && (
                <p className="rounded-lg border p-3 text-xs leading-snug">
                  <b>«Deja» es margen bruto, no ganancia.</b>{' '}
                  {sucs[0].por_que_no_se_puede_decir}
                </p>
              )}
              {!!sucs.length && (
                <p className="text-[11px] leading-snug text-muted-foreground">
                  {sucs[0].periodos_mirados}{' '}
                  {sucs[0].periodos_mirados === 1 ? 'mes completo' : 'meses completos'}:{' '}
                  {sucs[0].periodo_desde} a {sucs[0].periodo_hasta}.{' '}
                  <Link
                    href="/admin/direccion/sucursales"
                    className="underline decoration-dotted underline-offset-2"
                  >
                    Comparar cada una contra sí misma →
                  </Link>
                </p>
              )}
            </>
          )}
        </section>

        {/* ── C.6 · EL INFORME SEMANAL ────────────────────────────────── */}
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            El informe de la semana
          </h2>
          {parrafos === null ? (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              No se pudo leer el informe.
            </p>
          ) : !parrafos.length ? (
            <p className="rounded-lg border border-dashed p-4 text-xs leading-snug">
              <b>No hay nada para informar esta semana.</b> Y eso también es un resultado: el
              informe no inventa párrafos para parecer completo.
            </p>
          ) : (
            <div className="space-y-2 rounded-lg border p-4">
              {parrafos.map((p) => (
                <p key={p.orden} className="text-sm leading-relaxed">
                  {p.texto}
                </p>
              ))}
              <p className="border-t pt-2 text-[11px] leading-snug text-muted-foreground">
                Está escrito en SQL y no con un modelo de lenguaje, a propósito: así «sin
                adjetivos» es una propiedad que se puede verificar en el build y no una
                instrucción que alguien espera que se respete.
              </p>
            </div>
          )}
        </section>
      </div>
    </>
  )
}
