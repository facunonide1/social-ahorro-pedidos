import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { paginar } from '@/lib/supabase/paginar'
import { PageHeader } from '@/components/shared/page-header'

import { AQuienClient } from './a-quien-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'A quién comprarle' }

/**
 * LA DECISIÓN 3: A QUIÉN COMPRARLE.
 *
 * Hoy se toma a ojo. Lo que el sistema PUEDE contestar es a quién se le compra
 * cada producto —sale de `compra_venta.csv`— y cuánto se le compra a cada
 * droguería —sale de los comprobantes de 2026—.
 *
 * Lo que NO puede contestar es a quién CONVIENE. El precio por proveedor no
 * está en ningún archivo. Eso se declara, no se estima.
 */
export default async function AQuienPage() {
  await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente', 'comprador', 'administrativo', 'auditor'],
  })
  const sb = createClient()

  const [{ data: poder }, { count: conCosto }, { count: multi }] = await Promise.all([
    sb.rpc('compras_poder_negociacion', { p_meses: 12 }),
    sb.from('doc_precios_historial').select('id', { count: 'exact', head: true }),
    sb.from('compras_quien_provee').select('producto_id', { count: 'exact', head: true }).gt('cuantos_proveedores', 1),
  ])

  const { filas: provee } = await paginar<any>(
    sb.from('compras_quien_provee').select('*').order('producto_id').order('unidades', { ascending: false }),
    { maximo: 10_000 },
  )

  return (
    <>
      <PageHeader
        title="A quién comprarle"
        description="A quién se le compra cada producto y cuánto se le compra a cada droguería."
        breadcrumbs={[{ label: 'Compras', href: '/admin/compras' }, { label: 'A quién' }]}
      />
      <div className="p-4 md:p-6">
        <AQuienClient
          poder={((poder as any[]) ?? []).filter((p) => Number(p.comprobantes) > 0 || Number(p.productos_que_provee) > 0)}
          provee={provee}
          lineasDeCosto={conCosto ?? 0}
          productosMultiProveedor={multi ?? 0}
        />
      </div>
    </>
  )
}
