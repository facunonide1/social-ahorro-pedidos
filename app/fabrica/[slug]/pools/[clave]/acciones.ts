'use server'

import { revalidatePath } from 'next/cache'

import { puedeArmar, requireFabricaAccess } from '@/lib/fabrica/auth'
import { traerProyecto } from '@/lib/fabrica/datos'
import {
  aplicarCambio,
  diffLegible,
  escribirVersion,
  personasQueLoVen,
  revertirA,
  type LineaDiff,
  type Rechazo,
} from '@/lib/fabrica/escritor'
import { versionActual } from '@/lib/fabrica/versiones'
import { createAdminClient } from '@/lib/supabase/server'
import { PROYECTO_SOCIAL_AHORRO } from '@/lib/fabrica/flag'

async function gobernando(clave: string): Promise<boolean> {
  const adm = createAdminClient()
  const { data } = await adm
    .from('fab_instalaciones')
    .select('lector, pool:fab_pools!inner(clave)')
    .eq('proyecto_id', PROYECTO_SOCIAL_AHORRO)
    .eq('fab_pools.clave', clave)
    .maybeSingle()
  return (data as unknown as { lector: string } | null)?.lector === 'prendido'
}

/**
 * El diff, sin guardar nada.
 *
 * Se pide antes de aplicar: quien aprueba tiene que leer qué va a pasar y qué
 * cuesta deshacerlo. Que sea una llamada aparte y no un efecto de guardar es la
 * diferencia entre revisar y enterarse.
 */
export async function accionVerDiff(
  slug: string,
  clave: string,
  titulos: Record<string, string>,
): Promise<{ ok: boolean; diff?: LineaDiff[]; error?: string }> {
  const acceso = await requireFabricaAccess()
  const proyecto = await traerProyecto(slug)
  if (!proyecto || !puedeArmar(acceso, proyecto.id)) {
    return { ok: false, error: 'Tu rol no alcanza para proponer cambios.' }
  }

  const actual = await versionActual(clave)
  if (!actual) return { ok: false, error: 'Ese pool no tiene una versión actual.' }

  const propuesto = aplicarCambio(actual.manifiesto, { titulos })
  const diff = diffLegible(actual.manifiesto, propuesto, {
    gobernando: await gobernando(clave),
    personasConAcceso: await personasQueLoVen(actual.manifiesto),
  })
  return { ok: true, diff }
}

export async function accionGuardar(
  slug: string,
  clave: string,
  titulos: Record<string, string>,
  motivo: string,
): Promise<{ ok: boolean; numero?: number; rechazos?: Rechazo[]; error?: string }> {
  const acceso = await requireFabricaAccess()
  const proyecto = await traerProyecto(slug)
  if (!proyecto || !puedeArmar(acceso, proyecto.id)) {
    return { ok: false, error: 'Tu rol no alcanza para guardar cambios.' }
  }
  if (!motivo?.trim()) return { ok: false, error: 'Hace falta escribir por qué se hace este cambio.' }

  const actual = await versionActual(clave)
  if (!actual) return { ok: false, error: 'Ese pool no tiene una versión actual.' }

  const r = await escribirVersion({
    clave,
    manifiesto: aplicarCambio(actual.manifiesto, { titulos }),
    motivo,
    autorId: acceso.usuarioId,
    gobernando: await gobernando(clave),
  })

  if (r.ok) revalidatePath(`/fabrica/${slug}/pools/${clave}`)
  return { ok: r.ok, numero: r.numero, rechazos: r.rechazos, error: r.error }
}

export async function accionRevertir(
  slug: string,
  clave: string,
  versionId: string,
  motivo: string,
): Promise<{ ok: boolean; numero?: number; error?: string }> {
  const acceso = await requireFabricaAccess()
  const proyecto = await traerProyecto(slug)
  if (!proyecto || !puedeArmar(acceso, proyecto.id)) {
    return { ok: false, error: 'Tu rol no alcanza para revertir.' }
  }

  const r = await revertirA({
    clave,
    versionId,
    motivo,
    autorId: acceso.usuarioId,
    gobernando: await gobernando(clave),
  })

  if (r.ok) revalidatePath(`/fabrica/${slug}/pools/${clave}`)
  return { ok: r.ok, numero: r.numero, error: r.error ?? r.rechazos?.map((x) => x.motivo).join(' · ') }
}
