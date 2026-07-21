import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'
import { SopsClient, type SopRow } from './sops-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Procedimientos (SOP)' }

export default async function SopsPage() {
  const profile = await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'administrativo', 'auditor', 'encargado_sucursal', 'rrhh'] })
  const adm = createAdminClient()
  const { data } = await adm.from('compliance_sops').select('id, codigo, titulo, contenido, version, estado, firmado_at').order('codigo').limit(100)
  const rows: SopRow[] = ((data ?? []) as any[]).map((s) => ({ id: s.id, codigo: s.codigo, titulo: s.titulo, contenido: s.contenido ?? '', version: s.version, estado: s.estado, firmadoAt: s.firmado_at ? String(s.firmado_at).slice(0, 10) : null }))

  return (
    <>
      <PageHeader title="Procedimientos (SOP)" description="Los procedimientos operativos. Marcar vigente = firma registrada + anuncio con confirmación de lectura."
        breadcrumbs={[{ label: 'Compliance', href: '/admin/compliance' }, { label: 'SOPs' }]} />
      <div className="p-4 md:p-6"><SopsClient rows={rows} puedeFirmar={profile.rol === 'super_admin'} /></div>
    </>
  )
}
