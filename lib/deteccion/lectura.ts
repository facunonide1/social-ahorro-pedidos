/**
 * LO QUE EL SISTEMA ENCUENTRA SOLO.
 *
 * ── POR QUÉ UN MÓDULO Y NO QUERIES EN LA PÁGINA ─────────────────────────────
 *
 * Porque el informe semanal del bloque E lee exactamente lo mismo que la
 * pantalla. Si cada uno armara su propia consulta, el informe diría una cosa y
 * la pantalla otra, y el que esté desactualizado va a ser siempre el que menos
 * se mira.
 *
 * ── Y POR QUÉ SIEMPRE SE MIRA EL ERROR ──────────────────────────────────────
 *
 * Es la lección de la v0.99: `agentes_resumen(null)` tardaba 20 s contra un
 * `statement_timeout` de 8 s, nadie miraba el error, y `?? {}` dejaba todo en
 * cero. La pantalla decía «no hay nada urgente» con 2.402 cosas urgentes.
 *
 * Acá, si una consulta falla, devuelve null y la pantalla dice que no pudo
 * mirar. Null es «no lo puedo saber»; cero es «lo miré y no hay».
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export type Hallazgo = {
  id: string; detector: string; nombre_detector: string; familia: string
  clave: string; sucursal_id: string | null; sucursal: string | null
  producto_id: string | null
  hecho: string; plata: number | null; como_se_calculo: string | null
  que_no_dice: string; estado: string
  visto_primero: string; visto_ultimo: string; publicado_at: string | null
  veces_reaparecio: number; aviso_href: string | null
}

export type EstadoDetector = {
  clave: string; nombre: string; familia: string; historia_minima: string
  puede_correr: boolean; por_que_no: string | null; lo_que_hay: string | null
}

export type Marcador = {
  detector: string; nombre: string; familia: string
  abiertos: number; aciertos: number; no_acerto: number; sin_medir: number
  pct_acierto: number | null; plata_abierta: number
  descartes: number; volvieron: number
  se_puede_juzgar: boolean; veredicto: string
}

export type Parrafo = { orden: number; seccion: string; texto: string }

export type Motivo = {
  clave: string; nombre: string; silencia: boolean; no_era_real: boolean
  ayuda: string; orden: number
}

type Adm = Pick<SupabaseClient, 'rpc' | 'from'>

async function rpc<T>(adm: Adm, fn: string, args?: Record<string, unknown>): Promise<T[] | null> {
  const { data, error } = await adm.rpc(fn, args ?? {})
  if (error) {
    console.error(`[deteccion] ${fn} falló: ${error.message}`)
    return null
  }
  return (data ?? []) as T[]
}

export function hallazgos(adm: Adm, opts: {
  familia?: string | null; sucursal?: string | null
  soloPublicados?: boolean; limite?: number
} = {}) {
  return rpc<Hallazgo>(adm, 'deteccion_hallazgos', {
    p_familia: opts.familia ?? null,
    p_sucursal: opts.sucursal ?? null,
    p_solo_publicados: opts.soloPublicados ?? true,
    p_limite: opts.limite ?? 50,
  })
}

export const estadoDetectores = (adm: Adm) => rpc<EstadoDetector>(adm, 'deteccion_estado')
export const marcador = (adm: Adm) => rpc<Marcador>(adm, 'deteccion_marcador')

export async function motivos(adm: Adm): Promise<Motivo[] | null> {
  // El límite no es por tamaño: son seis motivos y es un catálogo cerrado. Es
  // para que el auditor de cortes no tenga que hacer una excepción — y porque
  // el día que haya más de cincuenta motivos de descarte, el problema no es el
  // corte de PostgREST: es que nadie va a leer cincuenta opciones.
  const { data, error } = await adm.from('deteccion_motivos').select('*').order('orden').limit(50)
  if (error) { console.error(`[deteccion] motivos: ${error.message}`); return null }
  return (data ?? []) as Motivo[]
}

/**
 * D.4 · Cuántos esperan en la lista larga.
 *
 * Se cuenta aparte y no con `length` de la lista: la lista viene con un
 * límite, así que su largo no es el total. Contar lo que se trajo en vez de
 * lo que hay es exactamente cómo un corte silencioso se vuelve invisible.
 */
export async function cuantosEsperan(adm: Adm): Promise<number | null> {
  const { count, error } = await adm.from('anomalias')
    .select('id', { count: 'exact', head: true })
    .is('publicado_at', null)
    .not('detector', 'is', null)
    .in('estado', ['abierta', 'reaparecio'])
  if (error) { console.error(`[deteccion] cuantosEsperan: ${error.message}`); return null }
  return count ?? null
}

/**
 * E · EL INFORME ESCRITO.
 *
 * ── POR QUÉ POR ROL Y NO UNO SOLO ───────────────────────────────────────────
 *
 * Porque un informe con secciones que no son de uno se deja de leer entero.
 * Cada detector declara quién lo lee (`detectores.roles`), y el informe de un
 * comprador no trae las diferencias de caja.
 *
 * Y porque un informe que le dice a un cajero «el sistema no encontró nada»
 * cuando encontró 1.235 cosas que lee otra gente le está diciendo que el
 * negocio está tranquilo. Eso no se sabe desde ese rol.
 */
export function informe(adm: Adm, opts: { sucursal?: string | null; rol?: string } = {}) {
  return rpc<Parrafo>(adm, 'informe_semanal', {
    p_sucursal: opts.sucursal ?? null,
    p_rol: opts.rol ?? 'gerente',
  })
}
