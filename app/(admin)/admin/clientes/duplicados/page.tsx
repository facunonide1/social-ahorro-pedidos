import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'
import { DuplicadosClient, type DedupRow } from './duplicados-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Duplicados · CRM' }

export default async function DuplicadosPage() {
  await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'marketing', 'administrativo'] })
  const sb = createClient()
  const { data } = await sb.from('dedup_pendientes')
    .select('id, score_match, criterio, cliente_a, cliente_b').eq('estado', 'pendiente')
    .order('score_match', { ascending: false }).limit(200)

  const ids = Array.from(new Set(((data ?? []) as any[]).flatMap((d) => [d.cliente_a, d.cliente_b])))
  const cliMap = new Map<string, any>()
  if (ids.length) {
    const { data: clis } = await sb.from('clientes').select('id, nombre, dni, telefono, email, fuentes, total_gastado_12m').in('id', ids)
    for (const c of (clis ?? []) as any[]) cliMap.set(c.id, c)
  }

  const rows: DedupRow[] = ((data ?? []) as any[]).map((d) => ({
    id: d.id, score: Number(d.score_match), criterio: d.criterio,
    a: cliMap.get(d.cliente_a) ?? null, b: cliMap.get(d.cliente_b) ?? null,
  })).filter((r) => r.a && r.b)

  return (
    <>
      <PageHeader title="Resolución de duplicados" description="Candidatos a ser la misma persona en distintas fuentes. Fusionar = una sola ficha."
        breadcrumbs={[{ label: 'Comercial' }, { label: 'Clientes', href: '/admin/clientes' }, { label: 'Duplicados' }]} />
      <div className="p-4 md:p-6">
        <DuplicadosClient rows={rows} />
      </div>
    </>
  )
}
