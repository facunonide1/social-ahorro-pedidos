import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'
import { B2bClient, type B2bRow } from './b2b-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'B2B · CRM' }

export default async function B2bPage() {
  await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'marketing', 'administrativo', 'auditor'] })
  const sb = createClient()

  const { data: clientes } = await sb.from('clientes').select('id, nombre, cuit, telefono, email, total_gastado_12m').eq('tipo', 'b2b').eq('activo', true).order('nombre')
  const ids = ((clientes ?? []) as any[]).map((c) => c.id)
  const ccteMap = new Map<string, any>(); const recMap = new Map<string, number>()
  if (ids.length) {
    const [{ data: cctes }, { data: recs }] = await Promise.all([
      sb.from('b2b_cuenta_corriente').select('cliente_id, saldo, limite_credito').in('cliente_id', ids),
      sb.from('b2b_pedidos_recurrentes').select('cliente_id').in('cliente_id', ids).eq('activo', true),
    ])
    for (const c of (cctes ?? []) as any[]) ccteMap.set(c.cliente_id, c)
    for (const r of (recs ?? []) as any[]) recMap.set(r.cliente_id, (recMap.get(r.cliente_id) ?? 0) + 1)
  }

  const rows: B2bRow[] = ((clientes ?? []) as any[]).map((c) => ({
    id: c.id, nombre: c.nombre, cuit: c.cuit, telefono: c.telefono, email: c.email,
    gastado: Number(c.total_gastado_12m), saldo: Number(ccteMap.get(c.id)?.saldo ?? 0),
    limite: Number(ccteMap.get(c.id)?.limite_credito ?? 0), recurrentes: recMap.get(c.id) ?? 0,
  }))

  return (
    <>
      <PageHeader title="Clientes B2B" description="Mayoristas / instituciones: cuenta corriente, lista de precios y pedidos recurrentes."
        breadcrumbs={[{ label: 'Comercial' }, { label: 'Clientes', href: '/admin/clientes' }, { label: 'B2B' }]} />
      <div className="p-4 md:p-6">
        <B2bClient rows={rows} />
      </div>
    </>
  )
}
