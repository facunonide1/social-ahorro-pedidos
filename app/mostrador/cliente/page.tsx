import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import { puede, type PermisosCustom } from '@/lib/types/permisos'
import type { AdminRole } from '@/lib/types/admin'

import { ClienteClient } from './cliente-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'El cliente' }

/**
 * E.1, E.2 y E.3 · EL CLIENTE, EN EL MOSTRADOR.
 *
 * Buscar por DNI, teléfono o nombre. Alta con nombre y teléfono. Y lo que se
 * ve: qué compró la última vez, si tiene un pedido esperando retiro, y si por
 * la frecuencia de SUS compras le toca volver.
 *
 * **Nada clínico.** Qué compró es un hecho comercial — una farmacia tiene el
 * historial de sus clientes igual que un almacén. Qué le pasa, no.
 */
export default async function ClienteMostradorPage() {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/login?next=/mostrador/cliente')

  const { data: me } = await sb.from('users_admin')
    .select('rol, activo, permisos_custom, sucursal_id').eq('id', user.id)
    .maybeSingle<{ rol: AdminRole; activo: boolean; permisos_custom: PermisosCustom | null; sucursal_id: string | null }>()
  if (!me?.activo) redirect('/logout?reason=sin_permiso')
  if (!puede(me.rol, me.permisos_custom ?? null, 'clientes', 'ver')) redirect('/hub?denied=1')

  return (
    <ClienteClient puedeCrear={puede(me.rol, me.permisos_custom ?? null, 'clientes', 'crear')} />
  )
}
