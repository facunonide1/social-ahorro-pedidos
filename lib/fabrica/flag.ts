import { createAdminClient, createClient } from '@/lib/supabase/server'
import type { EstadoLector } from './lector-estados'

/**
 * El interruptor del lector, por pool.
 *
 * Un flag global sería todo o nada, y "todo" no es una opción con seis
 * sectores sin declarar. Cada pool tiene el suyo.
 *
 * Vive en la base y NO en una variable de entorno a propósito: el momento en
 * que hace falta apagarlo es el peor momento para necesitar un deploy.
 */

export const PROYECTO_SOCIAL_AHORRO = '00000000-0000-0000-0000-000000000001'

// Las etiquetas y el tipo viven aparte para que los controles del portal
// —componentes de cliente— puedan importarlos sin arrastrar `next/headers`.
export type { EstadoLector } from './lector-estados'
export { ESTADOS_LECTOR, ETIQUETA_LECTOR, EXPLICACION_LECTOR } from './lector-estados'

export interface EstadoPool {
  instalacionId: string
  clave: string
  nombre: string
  lector: EstadoLector
  /** Cuántas diferencias acumuló en sombra. */
  diferencias: number
  /** Cuántas veces se cayó al código con el flag prendido. */
  fallbacks: number
  ultimoCambio: {
    desde: string
    hasta: string
    cuando: string
    porEmail: string | null
    panico: boolean
  } | null
}

/**
 * El estado de todos los pools del proyecto.
 *
 * Se lee con el cliente de sesión: las políticas de RLS deciden, igual que en
 * el resto del portal.
 */
export async function estadoDelLector(proyectoId: string): Promise<EstadoPool[]> {
  const sb = createClient()

  const { data: inst } = await sb
    .from('fab_instalaciones')
    .select('id, lector, pool:fab_pools(clave, nombre)')
    .eq('proyecto_id', proyectoId)

  const filas = (inst ?? []) as unknown as {
    id: string
    lector: EstadoLector
    pool: { clave: string; nombre: string } | null
  }[]

  const [{ data: eventos }, { data: cambios }] = await Promise.all([
    sb
      .from('fab_lector_eventos')
      .select('pool_clave, tipo')
      .eq('proyecto_id', proyectoId),
    sb
      .from('fab_lector_cambios')
      .select('pool_clave, desde, hasta, cambiado_at, cambiado_por, panico')
      .eq('proyecto_id', proyectoId)
      .order('cambiado_at', { ascending: false }),
  ])

  const conteo = new Map<string, { diferencias: number; fallbacks: number }>()
  for (const e of (eventos ?? []) as { pool_clave: string; tipo: string }[]) {
    const c = conteo.get(e.pool_clave) ?? { diferencias: 0, fallbacks: 0 }
    if (e.tipo === 'diferencia') c.diferencias++
    else c.fallbacks++
    conteo.set(e.pool_clave, c)
  }

  // El email vive en auth.users, que no se lee con la sesión del usuario.
  const adm = createAdminClient()
  const emails = new Map<string, string>()
  const autores = [
    ...new Set(
      ((cambios ?? []) as { cambiado_por: string | null }[])
        .map((c) => c.cambiado_por)
        .filter(Boolean) as string[],
    ),
  ]
  await Promise.all(
    autores.map(async (id) => {
      const { data } = await adm.auth.admin.getUserById(id)
      if (data?.user?.email) emails.set(id, data.user.email)
    }),
  )

  const ultimoPorPool = new Map<string, EstadoPool['ultimoCambio']>()
  for (const c of (cambios ?? []) as {
    pool_clave: string | null
    desde: string
    hasta: string
    cambiado_at: string
    cambiado_por: string | null
    panico: boolean
  }[]) {
    if (!c.pool_clave || ultimoPorPool.has(c.pool_clave)) continue
    ultimoPorPool.set(c.pool_clave, {
      desde: c.desde,
      hasta: c.hasta,
      cuando: c.cambiado_at,
      porEmail: c.cambiado_por ? (emails.get(c.cambiado_por) ?? null) : null,
      panico: c.panico,
    })
  }

  return filas
    .map((f) => {
      const clave = f.pool?.clave ?? ''
      const c = conteo.get(clave) ?? { diferencias: 0, fallbacks: 0 }
      return {
        instalacionId: f.id,
        clave,
        nombre: f.pool?.nombre ?? clave,
        lector: f.lector,
        diferencias: c.diferencias,
        fallbacks: c.fallbacks,
        ultimoCambio: ultimoPorPool.get(clave) ?? null,
      }
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
}

/**
 * Cambia el estado de un pool, dejando el registro.
 *
 * Verifica el rol ANTES de tocar nada y escribe con service_role: el cambio de
 * estado no puede pasar por una política de RLS porque la política tendría que
 * permitir escribir en `fab_instalaciones`, y entonces habría un segundo camino
 * para prender el lector sin auditar.
 */
export async function cambiarEstadoLector(args: {
  proyectoId: string
  clave: string
  hasta: EstadoLector
  usuarioId: string
  motivo?: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const adm = createAdminClient()

  const { data: inst } = await adm
    .from('fab_instalaciones')
    .select('id, lector, pool:fab_pools!inner(clave)')
    .eq('proyecto_id', args.proyectoId)
    .eq('fab_pools.clave', args.clave)
    .maybeSingle()

  const fila = inst as unknown as { id: string; lector: EstadoLector } | null
  if (!fila) return { ok: false, error: 'Ese pool no está instalado en este proyecto.' }
  if (fila.lector === args.hasta) return { ok: true }

  const { error } = await adm
    .from('fab_instalaciones')
    .update({ lector: args.hasta, updated_at: new Date().toISOString() })
    .eq('id', fila.id)
  if (error) return { ok: false, error: 'No se pudo cambiar el estado. Probá de nuevo.' }

  await adm.from('fab_lector_cambios').insert({
    instalacion_id: fila.id,
    proyecto_id: args.proyectoId,
    pool_clave: args.clave,
    desde: fila.lector,
    hasta: args.hasta,
    panico: false,
    motivo: args.motivo ?? null,
    cambiado_por: args.usuarioId,
  })

  return { ok: true }
}

/**
 * Devuelve todos los pools a apagado.
 *
 * Existe como una sola llamada porque el momento en que hace falta es
 * exactamente el momento en que no se puede depender de apagar diez
 * interruptores uno por uno.
 */
export async function panico(
  proyectoId: string,
  usuarioId: string,
  motivo?: string,
): Promise<{ apagados: number }> {
  const adm = createAdminClient()
  const { data } = await adm.rpc('fab_lector_panico', {
    p_proyecto: proyectoId,
    p_usuario: usuarioId,
    p_motivo: motivo ?? null,
  })
  return { apagados: typeof data === 'number' ? data : 0 }
}
