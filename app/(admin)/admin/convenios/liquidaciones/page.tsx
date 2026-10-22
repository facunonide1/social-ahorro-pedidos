import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { puede, type PermisosCustom } from '@/lib/types/permisos'
import { PageHeader } from '@/components/shared/page-header'

import { LiquidacionesClient } from './liquidaciones-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Liquidaciones' }

/**
 * E · IMPORTAR LO QUE YA PASÓ.
 *
 * El formato del archivo no se conoce. La pantalla se construyó para eso:
 * muestra qué columnas entendió, qué motivo le asignó a cada fila y qué deja
 * afuera, y recién después deja confirmar.
 */
export default async function LiquidacionesPage() {
  const perfil = await requireAdminHubAccess()
  const sb = createClient()

  const { data: me } = await sb.from('users_admin')
    .select('permisos_custom').eq('id', perfil.id)
    .maybeSingle<{ permisos_custom: PermisosCustom | null }>()

  const [{ data: convenios }, { data: sucursales }, { data: liqs }, { data: motivos }] =
    await Promise.all([
      sb.from('convenios').select('id, nombre').eq('activo', true).order('nombre'),
      sb.from('sucursales').select('id, nombre').eq('activa', true).eq('es_ecommerce', false).order('codigo'),
      sb.from('convenio_liquidaciones')
        .select('*, convenios(nombre), sucursales(nombre)')
        .order('created_at', { ascending: false }).limit(50),
      sb.from('convenio_debito_motivos').select('clave, nombre').order('orden'),
    ])

  return (
    <>
      <PageHeader
        title="Liquidaciones"
        description="Cargar los débitos que mandó la obra social: por archivo o por foto."
        breadcrumbs={[{ label: 'Obras sociales', href: '/admin/convenios' }, { label: 'Liquidaciones' }]}
      />
      <div className="p-4 md:p-6">
        <LiquidacionesClient
          convenios={(convenios ?? []) as any}
          sucursales={(sucursales ?? []) as any}
          liquidaciones={(liqs ?? []) as any}
          motivos={(motivos ?? []) as any}
          miSucursal={perfil.sucursal_id}
          puedeImportar={puede(perfil.rol, me?.permisos_custom ?? null, 'convenios', 'crear')}
        />
      </div>
    </>
  )
}
