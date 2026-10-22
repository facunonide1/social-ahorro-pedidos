import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'
import { cola, sinPoder, resumen, canales } from '@/lib/descripciones/lectura'

import { DescripcionesClient } from './descripciones-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Descripciones de producto' }

/**
 * F · LAS DESCRIPCIONES DE PRODUCTO.
 *
 * 7.737 publicaciones llevan el nombre del código abreviado de SIFACO y la
 * descripción vacía.
 *
 * ── LO QUE ESTA PANTALLA NO HACE ────────────────────────────────────────────
 *
 * No publica. Genera propuestas, se confirma un lote, y lo aprobado se
 * exporta a un archivo. Que el sistema escriba 7.600 descripciones en una
 * tienda sin que nadie las haya visto es el tipo de cosa que se descubre
 * cuando ya está hecha.
 */
export default async function DescripcionesPage() {
  await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente', 'comprador', 'marketing', 'administrativo'],
  })
  const adm = createAdminClient()

  const [enCola, noSePuede, res, cans] = await Promise.all([
    cola(adm, 40), sinPoder(adm), resumen(adm), canales(adm),
  ])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Descripciones de producto"
        description="Dicen qué es el producto. No dicen para qué sirve."
      />
      <DescripcionesClient
        enCola={enCola} noSePuede={noSePuede} resumen={res} canales={cans}
      />
    </div>
  )
}
