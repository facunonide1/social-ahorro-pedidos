import { createClient } from '@/lib/supabase/server'
import type {
  Instalacion,
  MiembroProyecto,
  Pool,
  PoolVersion,
  Proyecto,
  SectorCenso,
} from './tipos'

/**
 * Lecturas de la fábrica.
 *
 * Todo pasa por el cliente de sesión: las políticas RLS filtran por proyecto.
 * Ninguna función de acá escribe en una tabla que no sea `fab_*`, y ninguna
 * lee una tabla de Social Ahorro. La fábrica todavía no necesita leerlo: el
 * censo ya guardó lo que había que saber.
 */

export async function listarProyectos(): Promise<Proyecto[]> {
  const sb = createClient()
  const { data } = await sb
    .from('fab_proyectos')
    .select('*')
    .order('fecha_alta', { ascending: true })
  return (data ?? []) as Proyecto[]
}

export async function traerProyecto(slug: string): Promise<Proyecto | null> {
  const sb = createClient()
  const { data } = await sb
    .from('fab_proyectos')
    .select('*')
    .eq('slug', slug)
    .maybeSingle()
  return (data as Proyecto | null) ?? null
}

export async function listarCenso(proyectoId: string): Promise<SectorCenso[]> {
  const sb = createClient()
  const { data } = await sb
    .from('fab_censo_sectores')
    .select('*')
    .eq('proyecto_id', proyectoId)
    .order('clasificacion', { ascending: true })
    .order('pantallas', { ascending: false })
  return (data ?? []) as SectorCenso[]
}

export async function listarMiembros(proyectoId: string): Promise<MiembroProyecto[]> {
  const sb = createClient()
  const { data } = await sb
    .from('fab_usuarios_proyecto')
    .select('*')
    .eq('proyecto_id', proyectoId)
    .order('created_at', { ascending: true })
  return (data ?? []) as MiembroProyecto[]
}

export async function listarPools(): Promise<Pool[]> {
  const sb = createClient()
  const { data } = await sb
    .from('fab_pools')
    .select('*')
    .order('categoria', { ascending: true })
    .order('nombre', { ascending: true })
  return (data ?? []) as Pool[]
}

export interface InstalacionConPool extends Instalacion {
  pool: Pool | null
  version: PoolVersion | null
}

export async function listarInstalaciones(
  proyectoId: string,
): Promise<InstalacionConPool[]> {
  const sb = createClient()
  const { data } = await sb
    .from('fab_instalaciones')
    .select('*, pool:fab_pools(*), version:fab_pool_versiones(*)')
    .eq('proyecto_id', proyectoId)
    .order('created_at', { ascending: true })
  return (data ?? []) as unknown as InstalacionConPool[]
}

export interface VerificacionEspejo {
  id: string
  instalacion_id: string
  resultado: 'coincide' | 'difiere' | 'error'
  faltan_en_codigo: number
  faltan_en_declaracion: number
  resumen: string | null
  verificado_at: string
}

/** Actividad del proyecto: por ahora, las corridas del comparador de espejo. */
export async function listarVerificaciones(
  proyectoId: string,
  limite = 50,
): Promise<VerificacionEspejo[]> {
  const sb = createClient()
  const instalaciones = await listarInstalaciones(proyectoId)
  const ids = instalaciones.map((i) => i.id)
  if (ids.length === 0) return []

  const { data } = await sb
    .from('fab_declaraciones_espejo')
    .select('id, instalacion_id, resultado, faltan_en_codigo, faltan_en_declaracion, resumen, verificado_at')
    .in('instalacion_id', ids)
    .order('verificado_at', { ascending: false })
    .limit(limite)
  return (data ?? []) as VerificacionEspejo[]
}

/**
 * Sectores del censo que todavía no tienen un pool declarado.
 *
 * Es la pantalla que más importa del portal: mide la distancia entre lo que el
 * proyecto ES y lo que la fábrica SABE de él. Mientras esa distancia sea grande,
 * la fábrica no puede armar nada.
 */
export async function sectoresSinDeclarar(proyectoId: string): Promise<SectorCenso[]> {
  const [censo, instalaciones] = await Promise.all([
    listarCenso(proyectoId),
    listarInstalaciones(proyectoId),
  ])
  const declarados = new Set(
    instalaciones.map((i) => i.pool?.clave).filter(Boolean) as string[],
  )
  return censo.filter((s) => !declarados.has(s.clave))
}
