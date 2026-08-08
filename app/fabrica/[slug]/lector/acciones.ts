'use server'

import { revalidatePath } from 'next/cache'

import { requireFabricaAccess, puedeArmar } from '@/lib/fabrica/auth'
import { cambiarEstadoLector, panico } from '@/lib/fabrica/flag'
import type { EstadoLector } from '@/lib/fabrica/lector-estados'
import { traerProyecto } from '@/lib/fabrica/datos'

/**
 * Cambiar el estado del lector desde el portal.
 *
 * NUNCA por variable de entorno: el momento en que hace falta apagarlo es el
 * peor momento para necesitar un deploy.
 *
 * El rol se verifica ACÁ, antes de tocar nada. `cambiarEstadoLector` escribe con
 * service_role justamente para que no exista una política de RLS que permita
 * prender el lector por otro camino sin pasar por esta verificación.
 */
export async function accionCambiarEstado(
  slug: string,
  clave: string,
  hasta: EstadoLector,
  motivo?: string,
): Promise<{ ok: boolean; error?: string }> {
  const acceso = await requireFabricaAccess()
  const proyecto = await traerProyecto(slug)
  if (!proyecto) return { ok: false, error: 'No se encontró el proyecto.' }
  if (!puedeArmar(acceso, proyecto.id)) {
    return { ok: false, error: 'Tu rol en este proyecto no alcanza para cambiar el lector.' }
  }

  const r = await cambiarEstadoLector({
    proyectoId: proyecto.id,
    clave,
    hasta,
    usuarioId: acceso.usuarioId,
    motivo,
  })
  if (!r.ok) return { ok: false, error: r.error }

  revalidatePath(`/fabrica/${slug}/lector`)
  return { ok: true }
}

/** Devuelve todos los pools a apagado, de una. */
export async function accionPanico(
  slug: string,
  motivo?: string,
): Promise<{ ok: boolean; apagados?: number; error?: string }> {
  const acceso = await requireFabricaAccess()
  const proyecto = await traerProyecto(slug)
  if (!proyecto) return { ok: false, error: 'No se encontró el proyecto.' }
  if (!puedeArmar(acceso, proyecto.id)) {
    return { ok: false, error: 'Tu rol en este proyecto no alcanza para usar el pánico.' }
  }

  const { apagados } = await panico(proyecto.id, acceso.usuarioId, motivo)
  revalidatePath(`/fabrica/${slug}/lector`)
  return { ok: true, apagados }
}
