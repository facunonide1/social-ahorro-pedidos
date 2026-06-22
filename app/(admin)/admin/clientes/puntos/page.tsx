import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'
import type { PuntosRegla } from '@/lib/types/crm'
import { PuntosClient, type MovRow } from './puntos-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Puntos · CRM' }

export default async function PuntosPage() {
  await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'marketing', 'administrativo', 'auditor'] })
  const sb = createClient()

  const [{ data: reglas }, { data: movs }] = await Promise.all([
    sb.from('puntos_reglas').select('id, evento, descripcion, puntos, ratio_monto, activa').order('evento'),
    sb.from('puntos_movimientos').select('id, evento, puntos, created_at, sincronizado, cliente_id, clientes(nombre)').order('created_at', { ascending: false }).limit(200),
  ])

  const movRows: MovRow[] = ((movs ?? []) as any[]).map((m) => ({
    id: m.id, evento: m.evento, puntos: m.puntos, fecha: m.created_at, sincronizado: m.sincronizado,
    cliente: m.clientes?.nombre ?? '—',
  }))

  return (
    <>
      <PageHeader title="Motor de puntos" description="Definí las reglas acá; el saldo y el canje viven en la cuponera (Club). Se sincroniza."
        breadcrumbs={[{ label: 'Comercial' }, { label: 'Clientes', href: '/admin/clientes' }, { label: 'Puntos' }]} />
      <div className="p-4 md:p-6">
        <PuntosClient reglas={(reglas ?? []) as PuntosRegla[]} movimientos={movRows} />
      </div>
    </>
  )
}
