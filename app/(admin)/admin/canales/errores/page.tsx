import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'
import {
  erroresConSeguimiento, erroresQueVuelven, plazosDeDetectores,
} from '@/lib/canales/lectura'

import { TABS_CANALES, ROLES_CANAL } from '../_nav'
import { ErroresSeguimiento } from './errores-seguimiento'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Errores de catálogo' }

/**
 * A.7 · LOS ERRORES, CON SEGUIMIENTO HASTA EL CIERRE.
 *
 * El bloque I de la v1.4 construyó el plazo, el «no se puede» y el detector de
 * los que vuelven. No tenía pantalla: el plazo corría y nadie lo veía vencer.
 */
export default async function ErroresDeCanalPage() {
  await requireAdminHubAccess({ allowedRoles: [...ROLES_CANAL] })
  const adm = createAdminClient()

  const [errores, vuelven, plazos] = await Promise.all([
    erroresConSeguimiento(adm),
    erroresQueVuelven(adm, 2),
    plazosDeDetectores(adm),
  ])

  return (
    <>
      <PageHeader
        title="Errores de catálogo"
        description="Cada error con su plazo, su responsable y qué se hizo. Y los que se cerraron y volvieron."
        breadcrumbs={[{ label: 'Canales', href: '/admin/canales' }, { label: 'Errores' }]}
        tabs={TABS_CANALES}
      />
      <div className="p-4 md:p-6">
        <ErroresSeguimiento errores={errores} vuelven={vuelven} plazos={plazos} />
      </div>
    </>
  )
}
