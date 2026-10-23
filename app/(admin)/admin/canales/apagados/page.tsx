import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'
import { NumeroGrande, NumerosGrandes } from '@/components/shared/numero-grande'
import { apagadosConStock, apagadosResumen } from '@/lib/canales/lectura'

import { TABS_CANALES, ROLES_CANAL } from '../_nav'
import { ApagadosClient } from './apagados-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Apagados con stock' }

/**
 * B · LOS 57,7 MILLONES.
 *
 * ── POR QUÉ ESTE NÚMERO Y NO OTRO ───────────────────────────────────────────
 *
 * Es el más grande que encontró el sistema y el único que es plata que **ya
 * está en el depósito**. Los demás son riesgo (una sanción no tiene número) o
 * venta que podría no ocurrir. Este es stock pagado, con la luz apagada.
 *
 * ── Y POR QUÉ EL TITULAR NO ES EL NÚMERO QUE IMPORTA ────────────────────────
 *
 * Mostrarlo obligó a mirarlo de cerca, y de cerca dice dos cosas más:
 *
 *   · De los 1.790 productos, **542 no tienen costo cargado.** Su plata es
 *     null, no cero: los $57.780.179 son de 1.248 productos. Dividir el total
 *     por 1.790 daría un promedio que no existe.
 *   · Dos de los 1.248 pierden plata a cualquier precio. Publicarlos no es una
 *     oportunidad: es vender más rápido algo que pierde en cada unidad.
 *
 * La oportunidad real es $57.425.118 sobre 1.246 productos. El titular no
 * desaparece —está arriba, con su procedencia— pero el número que se usa para
 * decidir es el otro.
 */
export default async function ApagadosPage() {
  await requireAdminHubAccess({ allowedRoles: [...ROLES_CANAL] })
  const adm = createAdminClient()

  const [filas, resumen] = await Promise.all([
    apagadosConStock(adm, null, 600),
    apagadosResumen(adm, null),
  ])

  // El canal del lote. Hoy todos los apagados son de la tienda propia: los dos
  // PedidosYa no tienen catálogo cargado, así que no pueden tener un apagado.
  const canal = filas?.[0]?.canal_id ?? 'woo'

  return (
    <>
      <PageHeader
        title="Apagados con stock"
        description="Productos que nadie puede comprar en un canal, teniendo stock en el depósito."
        breadcrumbs={[{ label: 'Canales', href: '/admin/canales' }, { label: 'Apagados con stock' }]}
        tabs={TABS_CANALES}
      />
      <div className="space-y-5 p-4 md:p-6">
        {/* ── B.6 · LOS NÚMEROS, CADA UNO CON SU BOTÓN ─────────────────── */}
        {resumen === null ? (
          <p className="rounded-lg border border-dashed p-6 text-sm leading-snug text-muted-foreground">
            <b>No se pudo leer el resumen.</b> La consulta falló: no significa que no haya nada.
          </p>
        ) : (
          <>
            <NumerosGrandes columnas={4}>
              <NumeroGrande
                titulo="Lo que dice el titular"
                valor={resumen.plata_declarada}
                unidad="plata"
                detalle={`${resumen.productos.toLocaleString('es-AR')} productos apagados con stock`}
                de_donde={{ tipo: 'medido', texto: resumen.de_donde_sale_la_plata }}
                accion={{ label: 'Ver los 1.790', href: '#lista' }}
              />
              <NumeroGrande
                titulo="La oportunidad real"
                valor={resumen.oportunidad_real}
                unidad="plata"
                detalle={`${resumen.productos_de_la_oportunidad.toLocaleString('es-AR')} productos que convienen y no pierden plata`}
                de_donde={{ tipo: 'medido', texto: resumen.como_se_calculo_la_oportunidad }}
                accion={{ label: 'Prepararlos para publicar', href: '#lista' }}
              />
              <NumeroGrande
                titulo="Pierden plata igual"
                valor={resumen.pierden_igual}
                unidad="cantidad"
                detalle={`no van al lote · ${resumen.plata_de_los_que_pierden.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })} de stock quieto`}
                de_donde={{ tipo: 'medido', texto: 'el costo es mayor que lo que quedaría de la venta: es un problema de precio, no de canal' }}
                accion={{ label: 'Ver cuáles', href: '#lista' }}
                riesgo
              />
              <NumeroGrande
                titulo="Sin costo cargado"
                valor={resumen.no_se_puede_juzgar}
                unidad="cantidad"
                detalle="no se puede decir si conviene publicarlos"
                de_donde={{
                  tipo: 'no_se_sabe',
                  texto: 'que el costo llegue con el maestro de SIFACO o con las facturas de compra',
                }}
                accion={{ label: 'Ver los 542', href: '#lista' }}
              />
            </NumerosGrandes>

            {/* Lo que el titular esconde, arriba y no al pie. */}
            <p className="rounded-lg border p-3 text-xs leading-snug">
              {resumen.por_que_el_total_no_es_de_todos}
            </p>
            <p className="text-[11px] leading-snug text-muted-foreground">
              <b>Y lo que ninguno de estos números dice:</b> {resumen.que_no_dice}
            </p>

            {/* B.3 · cuántos se pueden explicar y cuántos no. */}
            <div className="grid gap-x-4 gap-y-2 rounded-lg border border-dashed p-4 sm:grid-cols-2">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  tienen algún hecho que podría explicarlo
                </p>
                <p className="text-xl font-semibold tabular-nums">
                  {resumen.se_sabe_por_que_estan_apagados.toLocaleString('es-AR')}
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  no se sabe por qué están apagados
                </p>
                <p className="text-xl font-semibold tabular-nums">
                  {resumen.no_se_sabe_por_que.toLocaleString('es-AR')}
                </p>
              </div>
              <p className="text-[11px] leading-snug text-muted-foreground sm:col-span-2">
                Y los {resumen.se_sabe_por_que_estan_apagados.toLocaleString('es-AR')} del primer
                grupo tampoco lo saben: tienen un hecho del entorno que <b>podría</b> explicarlo.
                El canal no informa quién apagó un producto ni cuándo ni por qué, así que afirmar
                la causa sería inventarla.
              </p>
            </div>
          </>
        )}

        {/* ── B.1 a B.5 · LA LISTA ─────────────────────────────────────── */}
        <div id="lista" className="space-y-3 scroll-mt-4">
          <ApagadosClient filas={filas} canalPorDefecto={canal} />
        </div>
      </div>
    </>
  )
}
