import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { getSucursalActiva } from '@/lib/sucursal/server'
import { PageHeader } from '@/components/shared/page-header'
import { AUTO_SEGMENTOS, evaluarSegmento } from '@/lib/crm/segmentos'
import { SegmentosClient, type SegmentoAutoView, type SegmentoGuardado } from './segmentos-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Segmentos · CRM' }

export default async function SegmentosPage() {
  await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'marketing', 'administrativo', 'auditor'] })
  const sb = createClient()
  const ctx = getSucursalActiva()

  const autos: SegmentoAutoView[] = []
  for (const s of AUTO_SEGMENTOS) {
    const { count } = await evaluarSegmento(sb, s.regla, ctx)
    autos.push({ clave: s.clave, nombre: s.nombre, descripcion: s.descripcion, icon: s.icon, count })
  }

  const { data: guardados } = await sb.from('segmentos').select('id, nombre, descripcion, tipo, n_clientes, dinamico').eq('tipo', 'manual').order('created_at', { ascending: false })

  return (
    <>
      <PageHeader title="Segmentos" description="Grupos de clientes de NORA + tus segmentos a medida. Cada uno dispara una campaña."
        breadcrumbs={[{ label: 'Comercial' }, { label: 'Clientes', href: '/admin/clientes' }, { label: 'Segmentos' }]} />
      <div className="p-4 md:p-6">
        <SegmentosClient autos={autos} guardados={(guardados ?? []) as SegmentoGuardado[]} />
      </div>
    </>
  )
}
