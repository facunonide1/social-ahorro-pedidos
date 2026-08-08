'use server'

import { revalidatePath } from 'next/cache'

import { puedeArmar, requireFabricaAccess } from '@/lib/fabrica/auth'
import { traerProyecto } from '@/lib/fabrica/datos'
import {
  aplicarCambio,
  diffLegible,
  escribirOverride,
  escribirVersion,
  personasQueLoVen,
  revertirA,
  type LineaDiff,
  type Rechazo,
} from '@/lib/fabrica/escritor'
import { overridesActuales, resolver } from '@/lib/fabrica/overrides'
import { createAdminClient as adminCli } from '@/lib/supabase/server'
import { versionActual } from '@/lib/fabrica/versiones'
import { createAdminClient } from '@/lib/supabase/server'
import { PROYECTO_SOCIAL_AHORRO } from '@/lib/fabrica/flag'

/** Lo que este proyecto ve hoy: la pieza con sus overrides encima. */
async function efectivoDe(proyectoId: string, clave: string, deLaPieza: Awaited<ReturnType<typeof versionActual>> extends null ? never : NonNullable<Awaited<ReturnType<typeof versionActual>>>['manifiesto']) {
  const propios = await overridesActualesDe(proyectoId, clave)
  return resolver(deLaPieza, propios ?? null).manifiesto
}

async function overridesActualesDe(proyectoId: string, clave: string) {
  const { data } = await adminCli()
    .from('fab_instalaciones')
    .select('id, pool:fab_pools!inner(clave)')
    .eq('proyecto_id', proyectoId)
    .eq('fab_pools.clave', clave)
    .maybeSingle()
  const id = (data as unknown as { id: string } | null)?.id
  if (!id) return null
  return (await overridesActuales(id))?.overrides ?? null
}

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

  // El diff se calcula contra lo que este proyecto ve hoy (pieza + overrides),
  // no contra la pieza pelada: si no, mostraría como cambio algo que este
  // negocio ya tenía distinto.
  const efectivo = await efectivoDe(proyecto.id, clave, actual.manifiesto)
  const propuesto = aplicarCambio(efectivo, { titulos })
  const diff = diffLegible(efectivo, propuesto, {
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

  // UN TÍTULO ES DE LA INSTALACIÓN, NO DE LA PIEZA. Guardarlo como versión del
  // pool —que es lo que hacía v0.63— se lo cambiaría a todos los proyectos que
  // la instalaron.
  const propios = await overridesActualesDe(proyecto.id, clave)
  const soloLosDistintos: Record<string, string> = {}
  for (const [ruta, titulo] of Object.entries(titulos)) {
    const enLaPieza = actual.manifiesto.pantallas.find((p) => p.ruta === ruta)?.titulo
    // Si el proyecto vuelve al texto de la pieza, se saca el override en vez de
    // guardar uno igual al default: un override que repite el default es ruido
    // que después nadie sabe si es una decisión o un descuido.
    if (titulo !== enLaPieza) soloLosDistintos[ruta] = titulo
  }

  const r = await escribirOverride({
    proyectoId: proyecto.id,
    clave,
    overrides: { ...(propios ?? {}), titulos: soloLosDistintos },
    motivo,
    autorId: acceso.usuarioId,
  })

  if (r.ok) revalidatePath(`/fabrica/${slug}/pools/${clave}`)
  return {
    ok: r.ok,
    numero: r.numero,
    error: r.error ?? r.rechazos?.map((x) => `${x.campo}: ${x.motivo}`).join(' · '),
  }
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
