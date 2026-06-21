import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'
import type { AccionExport, PerfilDatos } from '@/lib/types/centro-datos'
import { ExportarClient } from './exportar-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Exportar · Centro de Datos' }

export default async function ExportarPage({ searchParams }: { searchParams: { accion?: string } }) {
  await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente'] })
  const sb = createClient()

  const [{ data: acciones }, { data: perfiles }, { data: sucursales }, { data: rubrosRaw }] = await Promise.all([
    sb.from('acciones_export').select('*').eq('activa', true).order('es_sistema', { ascending: false }).order('nombre'),
    sb.from('perfiles_datos').select('*').eq('activo', true).eq('direccion', 'export').order('nombre'),
    sb.from('sucursales').select('id, nombre').order('nombre'),
    sb.from('productos_catalogo').select('rubro').not('rubro', 'is', null).limit(5000),
  ])
  const rubros = Array.from(new Set(((rubrosRaw ?? []) as any[]).map((r) => r.rubro).filter(Boolean))).sort()

  return (
    <>
      <PageHeader title="Exportar" description="Generá archivos en el formato exacto que SIFACO espera. Vista previa antes de descargar."
        breadcrumbs={[{ label: 'Centro de Datos', href: '/admin/centro-datos' }, { label: 'Exportar' }]} />
      <div className="p-4 md:p-6">
        <ExportarClient
          acciones={(acciones ?? []) as AccionExport[]}
          perfilesFormato={(perfiles ?? []) as PerfilDatos[]}
          sucursales={(sucursales ?? []) as { id: string; nombre: string }[]}
          rubros={rubros as string[]}
          accionInicial={searchParams.accion ?? null}
        />
      </div>
    </>
  )
}
