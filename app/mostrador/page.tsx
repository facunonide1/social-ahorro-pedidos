import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import { puede, type PermisosCustom } from '@/lib/types/permisos'
import type { AdminRole } from '@/lib/types/admin'
import { estadoDelOrden, cuandoSeLeyoElStock } from '@/lib/mostrador/buscar'

import { MostradorClient } from './mostrador-client'

export const dynamic = 'force-dynamic'

/** Quién ve la plata detrás del orden (F.7). Igual lista que la API. */
const VEN_PLATA: AdminRole[] = ['super_admin', 'gerente', 'comprador', 'tesoreria', 'auditor']

export default async function MostradorPage() {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/login?next=/mostrador')

  const { data: me } = await sb.from('users_admin')
    .select('rol, activo, permisos_custom, sucursal_id').eq('id', user.id)
    .maybeSingle<{ rol: AdminRole; activo: boolean; permisos_custom: PermisosCustom | null; sucursal_id: string | null }>()
  if (!me?.activo) redirect('/logout?reason=sin_permiso')
  if (!puede(me.rol, me.permisos_custom ?? null, 'operaciones', 'ver')) redirect('/hub?denied=1')

  // Regla de oro 8. Quien no tiene sucursal asignada elige una: el stock, el
  // vencimiento y lo que se vende son de UNA sucursal, y sin eso el orden de
  // la lista no significa nada.
  const { data: sucursales } = await sb.from('sucursales')
    .select('id, nombre, codigo').eq('activa', true).eq('es_ecommerce', false).order('codigo')

  const miSucursal = me.sucursal_id
  const estado = await estadoDelOrden(sb, miSucursal)

  return (
    <MostradorClient
      sucursales={(sucursales ?? []) as any}
      miSucursal={miSucursal}
      verPlata={VEN_PLATA.includes(me.rol)}
      estado={estado}
      fotoDelStock={cuandoSeLeyoElStock(estado?.stock_leido_at ?? null)}
    />
  )
}
