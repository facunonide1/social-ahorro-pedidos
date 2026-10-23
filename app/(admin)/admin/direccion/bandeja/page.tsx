import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getSucursalActiva } from '@/lib/sucursal/server'
import { PageHeader } from '@/components/shared/page-header'
import { bandeja, bandejaResumen } from '@/lib/direccion/lectura'

import { TABS_DIRECCION } from '../_nav'
import { BandejaClient } from './bandeja-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Lo que espera' }

/**
 * E · TODO LO QUE ESPERA, EN UN SOLO LUGAR.
 *
 * ── EL PROBLEMA QUE RESUELVE ────────────────────────────────────────────────
 *
 * Lo que espera decisión está en seis sectores: decisiones, detección, errores
 * de catálogo, convenios, tareas y lotes. Seis pantallas, y ninguna que diga
 * qué hacer primero. Alguien que entra a trabajar tiene que recorrer las seis
 * y comparar de memoria.
 *
 * ── EL ERROR QUE NO SE COMETIÓ ──────────────────────────────────────────────
 *
 * Los hallazgos y los errores de catálogo son **la misma tabla**. Leerlos como
 * dos fuentes habría contado dos veces los 30 errores de canal publicados: la
 * bandeja diría 105 renglones donde hay 75, y la plata estaría inflada en
 * $10,1 M. Se parten por `familia`.
 *
 * ── Y LO QUE ESTA PANTALLA NO HACE ──────────────────────────────────────────
 *
 * No resuelve nada acá. Cada renglón lleva a la pantalla de su sector, donde
 * está la acción con su firma y su registro. Una bandeja que además ejecuta
 * sería un séptimo lugar donde se decide, y el problema era justamente que hay
 * seis.
 */
export default async function BandejaPage() {
  await requireAdminHubAccess({})
  const sb = createClient()
  const adm = createAdminClient()

  const { data: { user } } = await sb.auth.getUser()
  const { sucursalId } = getSucursalActiva()

  // La sucursal NO se usa para filtrar la consulta: se filtra en el cliente
  // para que los tres botones de E.3 cambien la vista sin recargar. Lo que la
  // consulta sí respeta es el presupuesto de interrupción.
  const [items, resumen] = await Promise.all([
    bandeja(adm, user?.id ?? null, null, 400),
    bandejaResumen(adm, user?.id ?? null, null),
  ])

  return (
    <>
      <PageHeader
        title="Lo que espera"
        description="Las seis fuentes en una lista, ordenada por plata. Lo que no se puede costear, abajo y separado."
        breadcrumbs={[{ label: 'Dirección', href: '/admin/direccion' }, { label: 'Lo que espera' }]}
        tabs={TABS_DIRECCION}
      />
      <div className="p-4 md:p-6">
        <BandejaClient items={items} resumen={resumen} sucursalActiva={sucursalId} />
      </div>
    </>
  )
}
