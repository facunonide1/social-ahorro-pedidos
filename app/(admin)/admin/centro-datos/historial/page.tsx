import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'
import { HistorialClient, type ImportRow, type ExportRow } from './historial-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Historial · Centro de Datos' }

export default async function HistorialPage() {
  await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente'] })
  const sb = createClient()

  const [{ data: imports }, { data: exports }, { data: sucs }, { data: perfiles }] = await Promise.all([
    sb.from('import_jobs').select('*').order('created_at', { ascending: false }).limit(100),
    sb.from('export_jobs').select('*').order('created_at', { ascending: false }).limit(100),
    sb.from('sucursales').select('id, nombre'),
    sb.from('perfiles_datos').select('id, nombre'),
  ])
  const sucMap = new Map(((sucs ?? []) as any[]).map((s) => [s.id, s.nombre]))
  const perfMap = new Map(((perfiles ?? []) as any[]).map((p) => [p.id, p.nombre]))

  const importRows: ImportRow[] = ((imports ?? []) as any[]).map((j) => ({
    id: j.id, perfil: perfMap.get(j.perfil_id) ?? '—', archivo: j.archivo_nombre,
    sucursal: j.sucursal_id ? sucMap.get(j.sucursal_id) ?? null : null,
    filas_total: j.filas_total, filas_ok: j.filas_ok, filas_sin_match: j.filas_sin_match,
    anomalias: j.anomalias ?? [], resumen: j.resumen ?? {}, estado: j.estado,
    usuario: j.por_usuario_nombre, created_at: j.created_at, revertido_at: j.revertido_at,
  }))
  const exportRows: ExportRow[] = ((exports ?? []) as any[]).map((j) => ({
    id: j.id, nombre: j.nombre, filas: j.filas, archivo: j.archivo_generado,
    formato: j.formato, usuario: j.por_usuario_nombre, created_at: j.created_at,
  }))

  return (
    <>
      <PageHeader title="Historial" description="Cada importación y exportación, con detalle y rollback."
        breadcrumbs={[{ label: 'Centro de Datos', href: '/admin/centro-datos' }, { label: 'Historial' }]} />
      <div className="p-4 md:p-6">
        <HistorialClient imports={importRows} exports={exportRows} />
      </div>
    </>
  )
}
