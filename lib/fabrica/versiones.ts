import { createAdminClient, createClient } from '@/lib/supabase/server'
import { MANIFIESTOS } from './manifiestos'
import type { Manifiesto } from './tipos'

/**
 * Acceso a las versiones declaradas.
 *
 * Desde v0.63 la fuente de verdad es la base: `fab_pool_versiones` con
 * `es_actual`. La copia en `lib/fabrica/manifiestos/` quedó como SEMILLA — sirve
 * para arrancar un proyecto en frío y como respaldo si la base todavía no tiene
 * nada, y para nada más.
 *
 * La distinción importa al leer un número: el comparador tiene que verificar la
 * versión que GOBIERNA, no la copia que quedó en el repo. Si verificara la copia
 * daría verde mientras la que manda está rota.
 */

export interface VersionDeclarada {
  id: string
  poolId: string
  clave: string
  numero: number
  version: string
  manifiesto: Manifiesto
  estado: string
  esActual: boolean
  motivo: string | null
  revierteA: string | null
  creadaAt: string
  autorId: string | null
}

interface FilaVersion {
  id: string
  pool_id: string
  numero: number
  version: string
  manifiesto: Manifiesto
  estado: string
  es_actual: boolean
  notas_cambio: string | null
  revierte_a: string | null
  created_at: string
  created_by: string | null
  pool?: { clave: string } | null
}

function aVersion(f: FilaVersion, clave?: string): VersionDeclarada {
  return {
    id: f.id,
    poolId: f.pool_id,
    clave: clave ?? f.pool?.clave ?? '',
    numero: f.numero,
    version: f.version,
    manifiesto: f.manifiesto,
    estado: f.estado,
    esActual: f.es_actual,
    motivo: f.notas_cambio,
    revierteA: f.revierte_a,
    creadaAt: f.created_at,
    autorId: f.created_by,
  }
}

/** La versión que gobierna hoy. Con el cliente de administración: la usa el servidor. */
export async function versionActual(clave: string): Promise<VersionDeclarada | null> {
  const adm = createAdminClient()
  const { data } = await adm
    .from('fab_pool_versiones')
    .select('*, pool:fab_pools!inner(clave)')
    .eq('fab_pools.clave', clave)
    .eq('es_actual', true)
    .maybeSingle()
  return data ? aVersion(data as unknown as FilaVersion, clave) : null
}

/** Todo el historial de un pool, de la más nueva a la más vieja. */
export async function historial(clave: string): Promise<VersionDeclarada[]> {
  const sb = createClient()
  const { data } = await sb
    .from('fab_pool_versiones')
    .select('*, pool:fab_pools!inner(clave)')
    .eq('fab_pools.clave', clave)
    .order('numero', { ascending: false })
  return ((data ?? []) as unknown as FilaVersion[]).map((f) => aVersion(f, clave))
}

/**
 * El manifiesto que hay que usar para verificar.
 *
 * La base primero; la semilla sólo si la base no tiene nada. Verificar la
 * semilla cuando existe la fila es verificar algo que no gobierna.
 */
export async function manifiestoVigente(
  clave: string,
): Promise<{ manifiesto: Manifiesto; origen: 'base' | 'semilla' } | null> {
  const v = await versionActual(clave)
  if (v) return { manifiesto: v.manifiesto, origen: 'base' }
  const semilla = MANIFIESTOS[clave]?.manifiesto
  return semilla ? { manifiesto: semilla, origen: 'semilla' } : null
}

/**
 * ¿La declaración que gobierna se separó de la semilla del repo?
 *
 * Separarse NO es un error: es lo que pasa cada vez que alguien corrige algo
 * con el escritor sin volver a tocar el código. Pero conviene verlo, porque un
 * proyecto nuevo arrancaría desde la semilla vieja.
 */
export function diferenciaConSemilla(clave: string, deLaBase: Manifiesto): string[] {
  const semilla = MANIFIESTOS[clave]?.manifiesto
  if (!semilla) return []

  const out: string[] = []
  const porRuta = new Map(semilla.pantallas.map((p) => [p.ruta, p]))
  for (const p of deLaBase.pantallas) {
    const s = porRuta.get(p.ruta)
    if (!s) {
      out.push(`la base declara la pantalla ${p.ruta} y la semilla no`)
      continue
    }
    if (s.titulo !== p.titulo) {
      out.push(`${p.ruta}: la semilla dice "${s.titulo}" y la base "${p.titulo}"`)
    }
  }
  for (const s of semilla.pantallas) {
    if (!deLaBase.pantallas.some((p) => p.ruta === s.ruta)) {
      out.push(`la semilla declara la pantalla ${s.ruta} y la base no`)
    }
  }
  return out
}
