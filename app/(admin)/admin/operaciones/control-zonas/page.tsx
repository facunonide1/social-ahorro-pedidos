import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { getSucursalActiva } from '@/lib/sucursal/server'
import { listAdminUsersLite } from '@/lib/supabase/admin-users'
import { PageHeader } from '@/components/shared/page-header'
import { ControlZonasClient } from './control-zonas-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Control por zonas' }

export default async function ControlZonasPage() {
  await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'sucursal', 'encargado_sucursal', 'administrativo', 'auditor'] })
  const adm = createAdminClient()
  const { sucursalId, esTodas } = getSucursalActiva()

  const scope = (q: any) => (!esTodas && sucursalId ? q.eq('sucursal_id', sucursalId) : q)
  const [{ data: zonas }, { data: controles }, { data: sucs }, users] = await Promise.all([
    scope(adm.from('zonas').select('*').eq('activa', true).order('nombre')),
    scope(adm.from('controles_zona').select('*').order('created_at', { ascending: false }).limit(150)),
    adm.from('sucursales').select('id, nombre').eq('activa', true).order('nombre'),
    listAdminUsersLite(adm, { soloActivos: true }),
  ])

  const nombreSuc = new Map<string, string>(((sucs ?? []) as any[]).map((s) => [s.id, s.nombre]))
  const nombreUser = new Map<string, string>((users ?? []).map((u) => [u.id, u.nombre ?? u.email ?? '—']))
  const zonaNombre = new Map<string, string>(((zonas ?? []) as any[]).map((z) => [z.id, z.nombre]))

  // histórico: qué zona descuadra más (suma de valor_diferencia de controles cerrados)
  const rankZona = new Map<string, { zona: string; sucursal: string; controles: number; diferencias: number; valor: number }>()
  for (const c of (controles ?? []) as any[]) {
    if (c.estado !== 'cerrado') continue
    const g = rankZona.get(c.zona_id) ?? { zona: zonaNombre.get(c.zona_id) ?? '—', sucursal: nombreSuc.get(c.sucursal_id) ?? '—', controles: 0, diferencias: 0, valor: 0 }
    g.controles++; g.diferencias += c.n_diferencias; g.valor += Number(c.valor_diferencia)
    rankZona.set(c.zona_id, g)
  }

  return (
    <>
      <PageHeader title="Control de stock por zonas"
        description="Definí zonas físicas y controlá el stock por zona cada semana. Las diferencias alimentan el control de pérdidas."
        breadcrumbs={[{ label: 'Operación', href: '/admin/operaciones' }, { label: 'Control por zonas' }]} />
      <div className="p-4 md:p-6">
        <ControlZonasClient
          zonas={((zonas ?? []) as any[]).map((z) => ({ ...z, sucursal: nombreSuc.get(z.sucursal_id) ?? '—', responsable: z.responsable_id ? nombreUser.get(z.responsable_id) ?? '—' : null }))}
          controles={((controles ?? []) as any[]).map((c) => ({ id: c.id, zona: zonaNombre.get(c.zona_id) ?? '—', sucursal: nombreSuc.get(c.sucursal_id) ?? '—', fecha: c.fecha, estado: c.estado, n_productos: c.n_productos, n_diferencias: c.n_diferencias, valor: Number(c.valor_diferencia) }))}
          ranking={Array.from(rankZona.values()).sort((a, b) => b.valor - a.valor)}
          sucursales={(sucs ?? []) as any}
          usuarios={(users ?? []).map((u) => ({ id: u.id, nombre: u.nombre ?? u.email ?? '—' }))}
          sucursalActiva={sucursalId}
        />
      </div>
    </>
  )
}
