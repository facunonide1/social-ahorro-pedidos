import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { listAdminUsersLite } from '@/lib/supabase/admin-users'
import { PageHeader } from '@/components/shared/page-header'

import { ComunicadosClient, type ComRow, type Cronico } from './comunicados-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Comunicados' }

export default async function ComunicadosPage() {
  await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'administrativo', 'sucursal', 'auditor'] })
  const adm = createAdminClient()

  const { data: coms } = await adm.from('mensajes').select('id, canal_id, contenido, created_at, canales(nombre)').eq('tipo', 'comunicado').order('created_at', { ascending: false }).limit(100)
  const ids = ((coms ?? []) as any[]).map((c) => c.id)
  const canalIds = [...new Set(((coms ?? []) as any[]).map((c) => c.canal_id))]

  const [{ data: miembros }, { data: lecturas }, users] = await Promise.all([
    canalIds.length ? adm.from('canal_miembros').select('canal_id, user_id').in('canal_id', canalIds) : Promise.resolve({ data: [] as any[] }),
    ids.length ? adm.from('mensaje_lecturas').select('mensaje_id, user_id').in('mensaje_id', ids) : Promise.resolve({ data: [] as any[] }),
    listAdminUsersLite(adm, { soloActivos: false }),
  ])

  const nombre = new Map(((users ?? []) as any[]).map((u) => [u.id, u.nombre || u.email]))
  const miembrosPorCanal = new Map<string, string[]>()
  for (const m of (miembros ?? []) as any[]) { const a = miembrosPorCanal.get(m.canal_id) ?? []; a.push(m.user_id); miembrosPorCanal.set(m.canal_id, a) }
  const leyeronPorMsg = new Map<string, Set<string>>()
  for (const l of (lecturas ?? []) as any[]) { const s = leyeronPorMsg.get(l.mensaje_id) ?? new Set<string>(); s.add(l.user_id); leyeronPorMsg.set(l.mensaje_id, s) }

  const rows: ComRow[] = ((coms ?? []) as any[]).map((c) => {
    const members = miembrosPorCanal.get(c.canal_id) ?? []
    const leyeron = leyeronPorMsg.get(c.id) ?? new Set<string>()
    const leidoMiembros = members.filter((u) => leyeron.has(u)).length
    const total = members.length
    const faltantes = members.filter((u) => !leyeron.has(u)).map((u) => ({ id: u, nombre: nombre.get(u) ?? 'Usuario' }))
    return {
      id: c.id, canal_id: c.canal_id, canal: c.canales?.nombre ?? '—', contenido: c.contenido ?? '', fecha: c.created_at,
      leido: leidoMiembros, total, pct: total > 0 ? Math.round((leidoMiembros / total) * 100) : 0, faltantes,
    }
  })

  // No-lectores crónicos: pendientes en comunicados de más de 48hs.
  const hace48 = Date.now() - 48 * 3600 * 1000
  const pendientesPorUsuario = new Map<string, number>()
  for (const r of rows) {
    if (new Date(r.fecha).getTime() >= hace48) continue
    for (const f of r.faltantes) pendientesPorUsuario.set(f.id, (pendientesPorUsuario.get(f.id) ?? 0) + 1)
  }
  const cronicos: Cronico[] = [...pendientesPorUsuario.entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([id, pendientes]) => ({ id, nombre: nombre.get(id) ?? 'Usuario', pendientes }))

  return (
    <>
      <PageHeader title="Comunicados" description="Avisos importantes con confirmación de lectura. Recordá a los que faltan."
        breadcrumbs={[{ label: 'Comunicación', href: '/admin/comunicacion' }, { label: 'Comunicados' }]} />
      <div className="p-4 md:p-6">
        <ComunicadosClient rows={rows} cronicos={cronicos} />
      </div>
    </>
  )
}
