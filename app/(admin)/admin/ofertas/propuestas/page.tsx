import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'
import { PropuestasClient, type PropuestaRow } from './propuestas-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Propuestas de NORA' }

export default async function PropuestasPage() {
  await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'administrativo', 'auditor'] })
  const sb = createClient()

  const { data: ofertas } = await sb.from('ofertas').select('id, codigo, nombre, tipo, valor, justificacion, origen_ref, canales, estado, created_at').eq('propuesta_por', 'nora').eq('estado', 'borrador').order('created_at', { ascending: false }).limit(200)

  const rows: PropuestaRow[] = ((ofertas ?? []) as any[]).map((o) => ({
    id: o.id, codigo: o.codigo, nombre: o.nombre, tipo: o.tipo, valor: o.valor != null ? Number(o.valor) : null,
    justificacion: o.justificacion, motivo: o.origen_ref?.motivo ?? null, canales: o.canales ?? [],
  }))

  return (
    <>
      <PageHeader title="Propuestas de NORA" description="Liquidaciones de productos por vencer, dormidos y combos imán+dormido. Entran como borrador y requieren aprobación."
        breadcrumbs={[{ label: 'Ofertas', href: '/admin/ofertas' }, { label: 'Propuestas de NORA' }]} />
      <div className="space-y-4 p-4 md:p-6">
        <PropuestasClient propuestas={rows} />
      </div>
    </>
  )
}
