'use server'

import { revalidatePath } from 'next/cache'

import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'

const ROLES = ['super_admin', 'gerente', 'administrativo', 'encargado_sucursal', 'sucursal'] as const

/**
 * Arma un viaje con los pedidos elegidos, en el orden en que vinieron.
 *
 * El orden lo pone la persona que arma, no un algoritmo: acá NO hay ruta
 * optimizada. Calcular el recorrido necesita un mapa que no está, y el
 * repartidor conoce la zona mejor.
 */
export async function armarViaje(fd: FormData) {
  const perfil = await requireAdminHubAccess({ allowedRoles: [...ROLES] })
  const sb = createClient()

  const sucursalId = String(fd.get('sucursal_id') ?? '')
  const zonaId = String(fd.get('zona_id') ?? '') || null
  const repartidor = String(fd.get('repartidor_id') ?? '') || null
  const ids = fd.getAll('order_id').map(String).filter(Boolean)

  if (!sucursalId) return { error: 'Falta la sucursal de la que sale el viaje.' }
  if (ids.length === 0) return { error: 'Elegí al menos un pedido.' }

  const { data: viaje, error } = await sb.from('viajes_reparto').insert({
    sucursal_id: sucursalId, zona_id: zonaId, repartidor_id: repartidor,
    created_by: perfil.id,
  }).select('id').maybeSingle()
  if (error || !viaje) return { error: error?.message ?? 'No se pudo crear el viaje.' }

  const { error: e2 } = await sb.from('viaje_pedidos').insert(
    ids.map((order_id, i) => ({ viaje_id: viaje.id, order_id, orden: i + 1 })),
  )
  // Un pedido ya está en otro viaje: el índice único lo impide y hay que
  // decirlo, no dejar un viaje a medio armar.
  if (e2) {
    await sb.from('viajes_reparto').delete().eq('id', viaje.id)
    return { error: `No se pudo armar: ${e2.message}` }
  }

  revalidatePath('/admin/pedidos/envios/viajes')
  return { ok: true }
}

export async function cambiarEstadoViaje(fd: FormData) {
  await requireAdminHubAccess({ allowedRoles: [...ROLES] })
  const sb = createClient()
  const id = String(fd.get('id') ?? '')
  const estado = String(fd.get('estado') ?? '')
  if (!id || !estado) return { error: 'Faltan datos.' }

  const campos: Record<string, unknown> = { estado }
  if (estado === 'en_calle') campos.salida_at = new Date().toISOString()
  if (estado === 'cerrado') campos.cierre_at = new Date().toISOString()

  const { error } = await sb.from('viajes_reparto').update(campos).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/pedidos/envios/viajes')
  return { ok: true }
}
