import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Normalización de texto para el matching de items.
 *
 * ⚠️ NO REIMPLEMENTAR ESTA LÓGICA EN TYPESCRIPT.
 *
 * La única implementación vive en Postgres (`doc_normalizar_texto`, migración
 * 0084) y es la que llena `doc_items_alias.descripcion_norm` vía trigger. Si el
 * cliente normalizara por su cuenta y difiriera en un solo detalle —un acento,
 * un guión, un espacio— el índice trigram dejaría de matchear y el fallo sería
 * SILENCIOSO: no hay error, simplemente no encuentra nada.
 *
 * Por eso estas funciones son wrappers de RPC y nada más.
 */

/** Normaliza un texto. Devuelve null si queda vacío tras normalizar. */
export async function normalizarTexto(
  sb: SupabaseClient,
  texto: string,
): Promise<string | null> {
  const { data, error } = await sb.rpc('doc_normalizar_texto', { txt: texto })
  if (error) throw new Error(`doc_normalizar_texto: ${error.message}`)
  return (data as string | null) ?? null
}

/**
 * Normaliza N textos en UNA sola llamada.
 *
 * Usar siempre esta al procesar un documento o una lista de precios: normalizar
 * 20.000 descripciones es un round-trip, no 20.000. No hay excusa de
 * performance para reimplementar la lógica del lado del cliente.
 *
 * El array devuelto conserva el orden y la longitud del de entrada.
 */
export async function normalizarLote(
  sb: SupabaseClient,
  textos: string[],
): Promise<(string | null)[]> {
  if (!textos.length) return []
  const { data, error } = await sb.rpc('doc_normalizar_lote', { txts: textos })
  if (error) throw new Error(`doc_normalizar_lote: ${error.message}`)
  return (data as (string | null)[]) ?? []
}

/** Un alias candidato devuelto por la búsqueda por similitud. */
export type AliasCandidato = {
  id: string
  item_id: string
  descripcion_tercero: string
  descripcion_norm: string
  tercero_id: string | null
  /** 0 a 1. Similitud trigram contra el término buscado. */
  similitud: number
}

/**
 * Busca alias por similitud. El término se normaliza del lado de la base con la
 * misma función que llenó `descripcion_norm` — por eso matchea.
 *
 * `terceroId` acota la búsqueda al proveedor: cada uno escribe el mismo producto
 * distinto, así que buscar en todos a la vez da peor señal.
 */
export async function buscarAlias(
  sb: SupabaseClient,
  texto: string,
  terceroId: string | null = null,
  limite = 10,
  minSimilitud = 0.3,
): Promise<AliasCandidato[]> {
  const { data, error } = await sb.rpc('doc_buscar_alias', {
    p_texto: texto,
    p_tercero_id: terceroId,
    p_limite: limite,
    p_min_sim: minSimilitud,
  })
  if (error) throw new Error(`doc_buscar_alias: ${error.message}`)
  return (data as AliasCandidato[]) ?? []
}
