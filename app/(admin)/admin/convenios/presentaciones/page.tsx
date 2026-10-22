import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { puede, type PermisosCustom } from '@/lib/types/permisos'
import { leerPresentaciones } from '@/lib/convenios/presentaciones'
import { PageHeader } from '@/components/shared/page-header'

import { PresentacionesClient } from './presentaciones-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Presentaciones' }

/**
 * B · LAS PRESENTACIONES.
 *
 * Se lee con la sesión del usuario: la RLS de la 0209 acota por sucursal. Un
 * encargado ve las de su sucursal y nada más — y no porque la pantalla filtre,
 * sino porque la base no se las manda. Si el filtro estuviera sólo acá, una
 * consulta directa las devolvería todas.
 */
export default async function PresentacionesPage() {
  const perfil = await requireAdminHubAccess()
  const sb = createClient()

  const { data: me } = await sb.from('users_admin')
    .select('permisos_custom').eq('id', perfil.id)
    .maybeSingle<{ permisos_custom: PermisosCustom | null }>()
  const custom = me?.permisos_custom ?? null

  const [presentaciones, { data: cierres }, { data: convenios }, { data: sucursales }] = await Promise.all([
    leerPresentaciones(sb),
    sb.from('convenio_cierres_proximos').select('*').order('dias', { nullsFirst: false }),
    sb.from('convenios').select('id, nombre, plazo_presentacion_dias, modo_presentacion')
      .eq('activo', true).order('nombre'),
    sb.from('sucursales').select('id, nombre').eq('activa', true).eq('es_ecommerce', false).order('codigo'),
  ])

  return (
    <>
      <PageHeader
        title="Presentaciones"
        description="Lo que se le manda a cada obra social, por sucursal y por período."
        breadcrumbs={[{ label: 'Obras sociales', href: '/admin/convenios' }, { label: 'Presentaciones' }]}
      />
      <div className="p-4 md:p-6">
        <PresentacionesClient
          presentaciones={presentaciones}
          cierres={(cierres ?? []) as any}
          convenios={(convenios ?? []) as any}
          sucursales={(sucursales ?? []) as any}
          miSucursal={perfil.sucursal_id}
          puedeCrear={puede(perfil.rol, custom, 'convenios', 'crear')}
        />
      </div>
    </>
  )
}
