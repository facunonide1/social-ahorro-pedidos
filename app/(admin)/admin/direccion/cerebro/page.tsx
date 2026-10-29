import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { leerCerebro } from '@/lib/cerebro/lectura'

import { CerebroClient } from './cerebro-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'El cerebro' }

/**
 * v1.5-cerebro · EL CEREBRO Y LA VOZ.
 *
 * **Solo para el dueño.** No es para los encargados ni para el mostrador: la
 * página pide super_admin, y `cerebro_estado()` lo vuelve a mirar adentro con
 * `auth.uid()` — si alguien llegara acá por otro camino, la base no le
 * devuelve nada.
 *
 * Se lee con la sesión de quien mira, nunca con el cliente de servicio. La
 * voz tampoco tiene más permisos que quien la usa.
 */
export default async function CerebroPage() {
  await requireAdminHubAccess({ allowedRoles: ['super_admin'] })
  const inicial = await leerCerebro(createClient())
  return <CerebroClient inicial={inicial} />
}
