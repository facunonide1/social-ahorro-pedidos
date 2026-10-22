import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { puede, type PermisosCustom } from '@/lib/types/permisos'
import { leerPadron } from '@/lib/convenios/padron'
import { PageHeader } from '@/components/shared/page-header'

import { PadronClient } from './padron-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Padrón de convenios' }

/**
 * A · EL PADRÓN.
 *
 * Se lee con la sesión del usuario: la RLS de la 0208 decide quién ve el
 * padrón. Leerlo con el cliente de servicio mostraría convenios a alguien que
 * no tiene el módulo, y la pantalla no se daría cuenta.
 */
export default async function PadronPage() {
  const perfil = await requireAdminHubAccess()
  const sb = createClient()

  const { data: me } = await sb.from('users_admin')
    .select('permisos_custom').eq('id', perfil.id)
    .maybeSingle<{ permisos_custom: PermisosCustom | null }>()
  const custom = me?.permisos_custom ?? null

  const convenios = await leerPadron(sb)
  const puedeCrear = puede(perfil.rol, custom, 'convenios', 'crear')
  const puedeEditar = puede(perfil.rol, custom, 'convenios', 'editar')

  return (
    <>
      <PageHeader
        title="Padrón de convenios"
        description="Las obras sociales y prepagas con las que se trabaja: qué cubren, en qué plazo se presenta y qué exigen."
        breadcrumbs={[{ label: 'Obras sociales', href: '/admin/convenios' }, { label: 'Padrón' }]}
      />
      <div className="p-4 md:p-6">
        <PadronClient convenios={convenios} puedeCrear={puedeCrear} puedeEditar={puedeEditar} />
      </div>
    </>
  )
}
