import { redirect, notFound } from 'next/navigation'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { puede, type PermisosCustom } from '@/lib/types/permisos'
import type { AdminRole } from '@/lib/types/admin'

import { DondeHayClient } from './donde-hay-client'

export const dynamic = 'force-dynamic'

/**
 * C · LO QUE NO HAY ACÁ.
 *
 * El caso que más venta recupera: hoy el cliente pregunta, no hay, se va, y
 * nadie se enteró de nada. Hay 5.594 productos con stock en más de una
 * sucursal — en la mayoría de los casos el producto está a doce cuadras.
 */
export default async function DondeHayPage({ params }: { params: { id: string } }) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect(`/login?next=/mostrador/${params.id}/donde-hay`)

  const { data: me } = await sb.from('users_admin')
    .select('rol, activo, permisos_custom, sucursal_id').eq('id', user.id)
    .maybeSingle<{ rol: AdminRole; activo: boolean; permisos_custom: PermisosCustom | null; sucursal_id: string | null }>()
  if (!me?.activo) redirect('/logout?reason=sin_permiso')
  if (!puede(me.rol, me.permisos_custom ?? null, 'operaciones', 'ver')) redirect('/hub?denied=1')

  const adm = createAdminClient()
  const { data: sucs } = await adm.from('sucursales')
    .select('id, nombre').eq('activa', true).eq('es_ecommerce', false).order('codigo')
  const mia = me.sucursal_id ?? ((sucs ?? [])[0] as any)?.id
  if (!mia) notFound()

  const [{ data: prod }, { data: donde }, { data: salidas }] = await Promise.all([
    adm.from('mostrador_indice')
      .select('producto_id, nombre, sku, presentacion, laboratorio, precio')
      .eq('producto_id', params.id).maybeSingle(),
    adm.rpc('mostrador_donde_hay', { p_producto: params.id, p_sucursal_actual: mia }),
    adm.rpc('mostrador_salidas', { p_sucursal: mia }),
  ])
  if (!prod) notFound()

  return (
    <DondeHayClient
      producto={{
        ...(prod as any),
        precio: (prod as any).precio == null ? null : Number((prod as any).precio),
      }}
      donde={((donde ?? []) as any[]).map((d) => ({
        ...d,
        stock: Number(d.stock ?? 0),
        reservado: Number(d.reservado ?? 0),
        disponible: Number(d.disponible ?? 0),
      }))}
      salidas={(salidas ?? []) as any}
      puedeTomar={puede(me.rol, me.permisos_custom ?? null, 'operaciones', 'crear')}
    />
  )
}
