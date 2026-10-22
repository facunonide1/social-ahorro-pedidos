import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'

import { FotoClient } from './foto-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Liquidación por foto' }

/**
 * E.3 · LA LIQUIDACIÓN EN PAPEL.
 *
 * Muchas liquidaciones llegan impresas. La foto se saca de pie, en el
 * mostrador, con el papel en la mano: botones de 48px y la cámara de atrás
 * directo.
 *
 * Reusa el motor de documentos (v0.93) con otro prompt. Y la confirmación es
 * la misma de siempre: el modelo lee, una persona mira, recién después se
 * guarda.
 */
export default async function FotoLiquidacionPage() {
  const perfil = await requireAdminHubAccess()
  const sb = createClient()

  const [{ data: convenios }, { data: sucursales }] = await Promise.all([
    sb.from('convenios').select('id, nombre').eq('activo', true).order('nombre'),
    sb.from('sucursales').select('id, nombre').eq('activa', true).eq('es_ecommerce', false).order('codigo'),
  ])

  return (
    <>
      <PageHeader
        title="Liquidación por foto"
        description="Para las que llegan en papel."
        breadcrumbs={[
          { label: 'Obras sociales', href: '/admin/convenios' },
          { label: 'Liquidaciones', href: '/admin/convenios/liquidaciones' },
          { label: 'Por foto' },
        ]}
      />
      <div className="p-4 md:p-6">
        <FotoClient
          convenios={(convenios ?? []) as any}
          sucursales={(sucursales ?? []) as any}
          miSucursal={perfil.sucursal_id}
        />
      </div>
    </>
  )
}
