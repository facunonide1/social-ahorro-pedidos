import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'
import {
  hallazgos, estadoDetectores, marcador, motivos, cuantosEsperan,
} from '@/lib/deteccion/lectura'

import { DeteccionClient } from './deteccion-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Lo que el sistema encontró' }

/**
 * LO QUE EL SISTEMA ENCONTRÓ SOLO.
 *
 * ── POR QUÉ ESTA PANTALLA ES CORTA ──────────────────────────────────────────
 *
 * Los doce detectores encuentran 1.235 cosas. Acá entran 32.
 *
 * No es que las otras 1.203 se tiren: están en la lista larga, esperando. Lo
 * que no entra en el presupuesto de interrupción no se pierde — pero tampoco
 * interrumpe, que es la única forma de que lo que SÍ está arriba se mire.
 *
 * ── Y POR QUÉ CADA HALLAZGO TRAE TRES COSAS ─────────────────────────────────
 *
 * El hecho, de dónde sale la plata, y lo que esto NO dice. Las tres o
 * ninguna: un hecho sin su «no dice» es justamente el aviso que alguien va a
 * leer como una acusación, y el sistema no sabe la causa.
 */
export default async function DeteccionPage({ searchParams }: {
  searchParams: { familia?: string; larga?: string }
}) {
  await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente', 'comprador', 'administrativo', 'auditor'],
  })
  const adm = createAdminClient()

  const familia = ['no_cuadra', 'cambio', 'catalogo'].includes(String(searchParams?.familia))
    ? String(searchParams.familia) : null
  const larga = searchParams?.larga === '1'

  const [lista, estados, marcadores, cats, esperan] = await Promise.all([
    hallazgos(adm, { familia, soloPublicados: !larga, limite: larga ? 200 : 60 }),
    estadoDetectores(adm),
    marcador(adm),
    motivos(adm),
    cuantosEsperan(adm),
  ])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lo que el sistema encontró"
        description="Sin que nadie lo busque. Ordenado por plata, no por fecha."
      />
      <DeteccionClient
        lista={lista} estados={estados} marcadores={marcadores}
        motivos={cats} esperan={esperan} familia={familia} larga={larga}
      />
    </div>
  )
}
