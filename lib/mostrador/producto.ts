import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * LA FICHA DE UN PRODUCTO, EN EL MOSTRADOR.
 *
 * Tres cosas y ninguna es clínica:
 *
 *   · **Equivalencias** · información de catálogo. Que dos productos tengan la
 *     misma composición es un dato del maestro, no una indicación.
 *   · **Dónde hay** · stock por sucursal.
 *   · **Cobertura** · qué dice cada convenio del padrón sobre este producto.
 *     Recibe un producto, no una persona.
 */

export type Relacion = 'misma_composicion' | 'otra_presentacion' | 'generico' | 'de_marca'

export const RELACION_TEXTO: Record<Relacion, { titulo: string; que_es: string }> = {
  misma_composicion: {
    titulo: 'Misma composición',
    que_es: 'Tienen exactamente la misma monodroga según el maestro de SIFACO. Que se puedan cambiar en un caso concreto lo dice el farmacéutico, no esta pantalla.',
  },
  otra_presentacion: {
    titulo: 'Otras presentaciones',
    que_es: 'El mismo producto en otro tamaño o cantidad.',
  },
  generico: {
    titulo: 'El genérico',
    que_es: 'Lleva el nombre de la droga en vez de una marca. Es un heurístico sobre el nombre, no un campo del maestro: SIFACO no declara cuál es genérico.',
  },
  de_marca: {
    titulo: 'La misma droga, de marca',
    que_es: 'Misma composición, con nombre comercial. Mismo heurístico que el genérico, al revés.',
  },
}

export interface Equivalente {
  producto_id: string
  sku: string
  nombre: string
  nombre_comercial: string | null
  laboratorio: string | null
  presentacion: string | null
  concentracion: string | null
  precio: number | null
  /** B.4 · contra el producto que se estaba mirando. */
  diferencia: number | null
  diferencia_pct: number | null
  stock: number
  disponible: number
  requiere_receta: boolean
  en_oferta: boolean
  relacion: Relacion
  /** Null cuando no se pudo leer la concentración de uno de los dos. */
  misma_concentracion: boolean | null
}

export interface PorQueNoHay {
  se_puede: boolean
  por_que?: string
  que_lo_arregla?: string
  igual_se_puede?: string
  monodroga?: string
  concentracion?: string | null
  concentracion_leida?: boolean
}

export interface Cobertura {
  convenio_id: string
  convenio: string
  sigla: string | null
  cobertura_pct: number | null
  de_donde: string
  precio: number | null
  /** Null cuando no se sabe el porcentaje: un cero diría que es gratis. */
  de_bolsillo: number | null
  cubre_pct_texto: string
  exige: string[] | null
}

export async function equivalencias(
  sb: SupabaseClient, productoId: string, sucursalId: string,
): Promise<{ filas: Equivalente[]; porQue: PorQueNoHay }> {
  const [{ data: eq }, { data: pq }] = await Promise.all([
    sb.rpc('mostrador_equivalencias', {
      p_producto: productoId, p_sucursal: sucursalId, p_limite: 12,
    }),
    sb.rpc('mostrador_por_que_no_hay_equivalentes', { p_producto: productoId }),
  ])
  return {
    filas: ((eq ?? []) as any[]).map((r) => ({
      ...r,
      precio: r.precio == null ? null : Number(r.precio),
      diferencia: r.diferencia == null ? null : Number(r.diferencia),
      diferencia_pct: r.diferencia_pct == null ? null : Number(r.diferencia_pct),
      stock: Number(r.stock ?? 0),
      disponible: Number(r.disponible ?? 0),
    })) as Equivalente[],
    porQue: (pq ?? { se_puede: false }) as PorQueNoHay,
  }
}

export async function cobertura(sb: SupabaseClient, productoId: string): Promise<Cobertura[]> {
  const { data } = await sb.rpc('mostrador_cobertura', { p_producto: productoId })
  return ((data ?? []) as any[]).map((r) => ({
    ...r,
    cobertura_pct: r.cobertura_pct == null ? null : Number(r.cobertura_pct),
    precio: r.precio == null ? null : Number(r.precio),
    de_bolsillo: r.de_bolsillo == null ? null : Number(r.de_bolsillo),
  })) as Cobertura[]
}

/**
 * B.4 · La diferencia de precio, dicha como la diría una persona.
 *
 * Es la objeción más común del mostrador —«¿y ese por qué es más caro?»— y lo
 * que el empleado necesita es la frase, no el número.
 */
export function frasePrecio(e: Equivalente): string {
  if (e.diferencia == null) return 'no se puede comparar el precio: a uno de los dos le falta'
  if (Math.abs(e.diferencia) < 1) return 'mismo precio'
  const abs = Math.abs(e.diferencia)
  const plata = `$${Math.round(abs).toLocaleString('es-AR')}`
  const pct = e.diferencia_pct == null ? '' : ` (${Math.abs(Math.round(e.diferencia_pct))}%)`
  return e.diferencia < 0 ? `${plata} más barato${pct}` : `${plata} más caro${pct}`
}
