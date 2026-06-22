import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'
import { hasEmailConfig } from '@/lib/email/resend'
import type { CampaniaCrm } from '@/lib/types/crm'
import { ComunicacionClient, type CampaniaRow, type SegmentoLite } from './comunicacion-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Comunicación · CRM' }

export default async function ComunicacionPage({ searchParams }: { searchParams: { segmento?: string; cliente?: string; cupon?: string } }) {
  await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'marketing', 'administrativo', 'auditor'] })
  const sb = createClient()

  const [{ data: camps }, { data: segs }] = await Promise.all([
    sb.from('campanias_crm').select('id, nombre, objetivo, canales, estado, redactado_por, metricas, segmento_id, created_at').order('created_at', { ascending: false }).limit(100),
    sb.from('segmentos').select('id, nombre, n_clientes').order('created_at', { ascending: false }),
  ])

  const rows: CampaniaRow[] = ((camps ?? []) as any[]).map((c) => ({
    id: c.id, nombre: c.nombre, objetivo: c.objetivo, canales: c.canales ?? [], estado: c.estado,
    redactado_por: c.redactado_por, metricas: c.metricas ?? {}, segmento_id: c.segmento_id, created_at: c.created_at,
  }))

  return (
    <>
      <PageHeader title="Comunicación" description="Campañas multicanal. NORA redacta el mensaje según el segmento y el objetivo."
        breadcrumbs={[{ label: 'Comercial' }, { label: 'Clientes', href: '/admin/clientes' }, { label: 'Comunicación' }]} />
      <div className="p-4 md:p-6">
        <ComunicacionClient
          campanias={rows}
          segmentos={(segs ?? []) as SegmentoLite[]}
          emailConfigurado={hasEmailConfig()}
          segmentoPre={searchParams.segmento ?? null}
        />
      </div>
    </>
  )
}
