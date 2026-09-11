import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { PageHeader } from '@/components/shared/page-header'
import { lente } from '@/lib/demo/lente'

import { RecepcionMovil } from './recepcion-movil'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Nueva recepción' }

/**
 * LA PANTALLA QUE SE USA PARADA EN EL DEPÓSITO.
 *
 * Con una persona apurada y el celular en la mano. Pocos campos, botones
 * grandes, y las dos fotos que ya se sacan hoy — que es todo el trabajo que
 * esta pantalla le pide de más a nadie: ninguno.
 */
export default async function NuevaRecepcionPage() {
  const profile = await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente', 'comprador', 'administrativo', 'sucursal', 'encargado_sucursal'],
  })
  const sb = createClient()

  const [{ data: sucursales }, { data: proveedores }] = await Promise.all([
    sb.from('sucursales').select('id, nombre, codigo').eq('activa', true).order('nombre'),
    lente(sb.from('proveedores').select('id, razon_social, es_drogueria')
      .eq('activo', true).order('razon_social').limit(500)),
  ])

  return (
    <>
      <PageHeader
        title="Llegó mercadería"
        description="Las dos fotos que ya sacás, acá. La de la factura se lee sola; la de SIFACO queda como comprobante."
        breadcrumbs={[{ label: 'Recepciones', href: '/admin/recepciones' }, { label: 'Nueva' }]}
      />
      <div className="mx-auto w-full max-w-2xl p-3 md:p-6">
        <RecepcionMovil
          sucursales={(sucursales ?? []) as any[]}
          proveedores={(proveedores ?? []) as any[]}
          sucursalDelUsuario={profile.sucursal_id}
        />
      </div>
    </>
  )
}
