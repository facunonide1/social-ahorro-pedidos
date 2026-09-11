import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { paginar } from '@/lib/supabase/paginar'
import { PageHeader } from '@/components/shared/page-header'

import { PlanClient } from './plan-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Plan de compra' }

/**
 * QUÉ Y CUÁNTO COMPRAR.
 *
 * Las dos primeras de las cuatro decisiones. Antes de la lista va el encabezado
 * en escala, porque el número que importa no es cuántos ítems faltan: es que
 * hay $266 M de stock contra $206 M de consumo mensual. El problema no es que
 * falte mercadería — está mal repartida.
 */
export default async function PlanPage() {
  await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente', 'comprador', 'administrativo', 'auditor'],
  })
  const sb = createClient()

  const [
    { data: global }, { data: urgencias }, { data: salud }, { data: params },
    { data: transferir }, { count: sinCalcular },
  ] = await Promise.all([
    sb.from('compras_global').select('*').maybeSingle(),
    sb.from('reco_compras_urgencia').select('*'),
    sb.from('compras_salud_stock').select('*'),
    sb.from('compras_parametros').select('*').order('clave'),
    sb.rpc('compras_transferir_se_puede'),
    sb.from('compras_sin_calcular').select('producto_id', { count: 'exact', head: true }),
  ])

  // Sólo lo que hay que comprar, ordenado por urgencia y por plata. El resto
  // —lo que sobra, lo dormido, lo de encargo— va en sus propias listas.
  const { filas: aComprar } = await paginar<any>(
    sb.from('reco_compras').select('*').not('urgencia', 'is', null)
      .order('urgencia').order('costo_sugerido', { ascending: false }),
    { maximo: 5000 },
  )
  const { filas: noComprar } = await paginar<any>(
    sb.from('reco_compras').select('*').or('sobra.eq.true,sin_venta_11m.eq.true,a_pedido.eq.true')
      .order('plata_parada', { ascending: false }),
    { maximo: 12_000 },
  )

  return (
    <>
      <PageHeader
        title="Plan de compra"
        description="Qué falta, cuánto pedir y qué no comprar. Sobre el consolidado de las cuatro sucursales."
        breadcrumbs={[{ label: 'Compras', href: '/admin/compras' }, { label: 'Plan' }]}
      />
      <div className="p-4 md:p-6">
        <PlanClient
          global={global as any}
          urgencias={(urgencias ?? []) as any[]}
          salud={(salud ?? []) as any[]}
          parametros={(params ?? []) as any[]}
          transferir={((transferir as any[]) ?? [])[0] ?? null}
          sinCalcular={sinCalcular ?? 0}
          aComprar={aComprar}
          noComprar={noComprar}
        />
      </div>
    </>
  )
}
