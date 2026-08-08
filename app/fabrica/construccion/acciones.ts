'use server'

import { revalidatePath } from 'next/cache'

import { requireFabricaAccess } from '@/lib/fabrica/auth'
import {
  cambiarEstadoPedido,
  vincularPedido,
  type EstadoPedido,
} from '@/lib/fabrica/pedidos'

/**
 * Decidir sobre la cola de construcción.
 *
 * El permiso es de DUEÑO y no de armador: un pedido cruza proyectos —esa es
 * toda su gracia— y quien arma un proyecto no tiene por qué poder cerrar algo
 * que otro negocio también pidió.
 */
async function permiso() {
  const acceso = await requireFabricaAccess()
  if (!acceso.esDueno) {
    return { ok: false as const, error: 'La cola de construcción la decide quien es dueño de la fábrica.' }
  }
  return { ok: true as const, acceso }
}

export async function accionCambiarEstadoPedido(
  id: string,
  estado: EstadoPedido,
  motivo?: string,
): Promise<{ ok: boolean; error?: string }> {
  const p = await permiso()
  if (!p.ok) return { ok: false, error: p.error }
  const r = await cambiarEstadoPedido({ id, estado, motivo, autorId: p.acceso.usuarioId })
  revalidatePath('/fabrica/construccion')
  return r
}

/** Juntar dos pedidos que piden lo mismo. Lo decide una persona, siempre. */
export async function accionVincularPedido(
  id: string,
  duplicadoDe: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const p = await permiso()
  if (!p.ok) return { ok: false, error: p.error }
  const r = await vincularPedido(id, duplicadoDe)
  revalidatePath('/fabrica/construccion')
  return r
}
