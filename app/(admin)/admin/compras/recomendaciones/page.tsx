import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { getSucursalActiva } from '@/lib/sucursal/server'
import { PageHeader } from '@/components/shared/page-header'
import { getRecomendaciones } from '@/lib/compras/recomendaciones'
import { RecomendacionesClient } from './recomendaciones-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Qué comprar · Compras' }

export default async function RecomendacionesPage({ searchParams }: { searchParams: { dias?: string } }) {
  await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'comprador', 'administrativo', 'auditor'] })
  const sb = createClient()
  const { sucursalId, esTodas } = getSucursalActiva()
  const dias = Math.max(3, Math.min(90, Number(searchParams.dias) || 14))

  const r = await getRecomendaciones(sb, { sucursalId, esTodas, dias, diasObjetivo: dias })

  return (
    <>
      <PageHeader title="Qué comprar" description="Recomendaciones de NORA según las ventas reales por SKU (Centro de Datos)."
        breadcrumbs={[{ label: 'Compras', href: '/admin/compras' }, { label: 'Qué comprar' }]} />
      <div className="p-4 md:p-6">
        <RecomendacionesClient
          recomendaciones={r.recomendaciones}
          quiebres={r.quiebres}
          dormido={r.dormido}
          resumen={r.resumen}
          dias={dias}
          sucursalId={esTodas ? null : sucursalId}
        />
      </div>
    </>
  )
}
