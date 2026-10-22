import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { paginar } from '@/lib/supabase/paginar'
import { createAdminClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'

import { DemandaClient, type ExisteRow, type LibreRow } from './demanda-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Radar de demanda' }

/**
 * D.4 · QUE TE PIDEN Y NO TENES.
 *
 * ── QUE CAMBIO EN LA v1.2 ───────────────────────────────────────────────────
 *
 * Esta pantalla existía desde la v0.50 y agrupaba las filas de
 * `demanda_invisible` en JavaScript, con `limit(5000)`. Dos problemas:
 *
 *   · el límite. 5.000 registros de faltante son tres meses de una sucursal
 *     con alguien que registra de verdad, y pasado eso el conteo era menor sin
 *     avisar — la misma clase de error que el corte de 1.000 filas;
 *   · no tenía la plata. Decía «te lo pidieron 12 veces» y no cuánto era eso,
 *     que es lo que hace que alguien lo compre.
 *
 * Ahora lee `demanda_invisible_resumen` y `demanda_sin_catalogo`, que agrupan
 * EN LA BASE y traen la venta perdida medida.
 *
 * ── D.6 · Y LOS DOS NUMEROS ─────────────────────────────────────────────────
 *
 * `demanda_real_vs_estimada` pone la estimación por fórmula al lado de lo
 * medido. **No se suman**: son dos cosas distintas medidas de dos formas.
 */
export default async function DemandaPage({ searchParams }: { searchParams: { dias?: string } }) {
  await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente', 'comprador', 'administrativo', 'auditor'],
  })
  const adm = createAdminClient()
  const dias = [7, 30, 90].includes(Number(searchParams?.dias)) ? Number(searchParams.dias) : 30
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString().slice(0, 10)

  // Las dos vistas agrupan en la base. Se paginan igual: el día que haya
  // 2.000 productos distintos pedidos, el corte de PostgREST no avisa.
  const [existeR, libreR, { data: dosNumeros }] = await Promise.all([
    paginar<any>(adm.from('demanda_invisible_resumen').select('*')
      .gte('hasta', desde).order('venta_perdida_medida', { ascending: false })
      .order('producto_id'), { maximo: 50_000 }),
    paginar<any>(adm.from('demanda_sin_catalogo').select('*')
      .gte('hasta', desde).order('veces', { ascending: false })
      .order('texto_norm'), { maximo: 50_000 }),
    adm.from('demanda_real_vs_estimada').select('*')
      .gt('veces_pedido', 0).order('perdida_medida', { ascending: false }).limit(50),
  ])

  const existe: ExisteRow[] = existeR.filas.map((r) => ({
    producto_id: r.producto_id,
    nombre: r.nombre,
    sku: r.sku,
    veces: Number(r.veces),
    unidades: Number(r.unidades_pedidas ?? 0),
    stock: Number(r.stock_hoy ?? 0),
    sucursales: [r.sucursal],
    // D.4 · la venta perdida MEDIDA.
    perdida_medida: Number(r.venta_perdida_medida ?? 0),
    perdida_de_los_que_se_fueron: Number(r.venta_perdida_de_los_que_se_fueron ?? 0),
    se_fueron: Number(r.se_fueron ?? 0),
    se_llevaron_otra: Number(r.se_llevaron_otra ?? 0),
    sin_desenlace: Number(r.sin_desenlace ?? 0),
    // Cuántos de esos pedidos no tenían precio: ahí la plata está subestimada.
    sin_precio: Number(r.sin_precio ?? 0),
  }))

  const libre: LibreRow[] = libreR.filas.map((r) => ({
    texto: r.texto,
    veces: Number(r.veces),
    sucursales: [r.ultima_sucursal ?? '—'],
    como_lo_escribieron: (r.como_lo_escribieron ?? []) as string[],
    se_fueron: Number(r.se_fueron ?? 0),
  }))

  return (
    <>
      <PageHeader
        title="Radar de demanda"
        description="La venta perdida hecha dato: lo que piden y no hay, con cuánto se fue."
        breadcrumbs={[{ label: 'Compras', href: '/admin/compras' }, { label: 'Radar de demanda' }]}
      />
      <div className="p-4 md:p-6">
        <DemandaClient
          existe={existe} libre={libre} dias={dias}
          dosNumeros={((dosNumeros ?? []) as any[]).map((d) => ({
            producto_id: d.producto_id, sku: d.sku, nombre: d.nombre, sucursal: d.sucursal,
            estimada: d.perdida_estimada_mes == null ? null : Number(d.perdida_estimada_mes),
            medida: Number(d.perdida_medida ?? 0),
            medida_de_los_que_se_fueron: Number(d.perdida_medida_de_los_que_se_fueron ?? 0),
            veces: Number(d.veces_pedido ?? 0),
            que_dicen: d.que_dicen_los_dos,
            estimacion_sin_costo: !!d.estimacion_sin_costo,
          }))}
          truncado={existeR.truncado || libreR.truncado}
        />
      </div>
    </>
  )
}
