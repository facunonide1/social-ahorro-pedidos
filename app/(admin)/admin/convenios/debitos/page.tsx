import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { puede, type PermisosCustom } from '@/lib/types/permisos'
import { leerDebitos, leerPorMotivo, leerPorSucursal } from '@/lib/convenios/debitos'
import { PageHeader } from '@/components/shared/page-header'

import { DebitosClient } from './debitos-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Débitos' }

/**
 * C · LOS DÉBITOS.
 *
 * ── POR QUÉ ESTA PANTALLA ES LA QUE JUSTIFICA EL SECTOR ─────────────────────
 *
 * Una farmacia puede estar perdiendo del 3% al 8% de su facturación en débitos
 * que nunca reclamó. No porque nadie quiera reclamarlos: porque llegan en un
 * papel, se miran una vez y se archivan, y nadie suma.
 *
 * Todo lo que se muestra acá sale de vistas que agregan en la base. El orden
 * por plata no es decoración: es la pregunta.
 */
export default async function DebitosPage() {
  const perfil = await requireAdminHubAccess()
  const sb = createClient()

  const { data: me } = await sb.from('users_admin')
    .select('permisos_custom').eq('id', perfil.id)
    .maybeSingle<{ permisos_custom: PermisosCustom | null }>()
  const custom = me?.permisos_custom ?? null

  // F.2 · los totales de la cadena son de los dueños. Un encargado ve los
  // débitos de su sucursal (la RLS se encarga) y no la comparación entre
  // sucursales, que es una decisión de dirección.
  const esDueño = perfil.rol === 'super_admin' || perfil.rol === 'gerente'

  const [{ filas, truncado }, porMotivo, porSucursal, { data: motivos }, { data: convenios }] =
    await Promise.all([
      leerDebitos(sb, { desdeDias: 90 }),
      leerPorMotivo(sb),
      esDueño ? leerPorSucursal(sb) : Promise.resolve([]),
      sb.from('convenio_debito_motivos').select('*').order('orden'),
      sb.from('convenios').select('id, nombre').eq('activo', true).order('nombre'),
    ])

  return (
    <>
      <PageHeader
        title="Débitos"
        description="Lo que la obra social no pagó, por qué, y cuánto de eso todavía se puede recuperar."
        breadcrumbs={[{ label: 'Obras sociales', href: '/admin/convenios' }, { label: 'Débitos' }]}
      />
      <div className="p-4 md:p-6">
        <DebitosClient
          debitos={filas} truncado={truncado}
          porMotivo={porMotivo} porSucursal={porSucursal}
          motivos={(motivos ?? []) as any}
          convenios={(convenios ?? []) as any}
          esDueño={esDueño}
          miSucursal={perfil.sucursal_id}
          puedeEditar={puede(perfil.rol, custom, 'convenios', 'editar')}
        />
      </div>
    </>
  )
}
