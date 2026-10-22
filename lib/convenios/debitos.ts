import type { SupabaseClient } from '@supabase/supabase-js'

import { paginar } from '@/lib/supabase/paginar'

/**
 * LOS DÉBITOS · LECTURA.
 *
 * ── LA PREGUNTA QUE CONTESTA ESTE ARCHIVO ───────────────────────────────────
 *
 * Cuál es el motivo que más plata se lleva, y cuánto de eso todavía se puede
 * recuperar. Las dos salen de vistas que agregan en la base: acá no se cuenta
 * nada en memoria.
 */

export type Reclamable = 'si' | 'no' | 'depende'
export type DebitoEstado = 'abierto' | 'reclamado' | 'recuperado' | 'perdido' | 'no_reclamable'

export const ESTADO_DEBITO_LABEL: Record<DebitoEstado, string> = {
  abierto: 'Abierto', reclamado: 'Reclamado', recuperado: 'Recuperado',
  perdido: 'Perdido', no_reclamable: 'No reclamable',
}

/**
 * Las situaciones que devuelve `convenio_recupero`.
 *
 * «Se perdió por dejarlo vencer» es la única que duele de verdad: era plata
 * recuperable y se fue porque nadie reclamó. Es el número que justifica todo
 * el sector.
 */
export const SITUACIONES = [
  'recuperado',
  'reclamado, esperando respuesta',
  'reclamable y sin reclamar',
  'se perdio por dejarlo vencer',
  'no reclamable',
  'no se puede saber',
] as const
export type Situacion = (typeof SITUACIONES)[number]

export const SITUACION_TEXTO: Record<Situacion, { label: string; que_significa: string; riesgo: 'alto' | 'medio' | 'ninguno' }> = {
  'recuperado': {
    label: 'Recuperado', riesgo: 'ninguno',
    que_significa: 'Se reclamó y la obra social lo devolvió.',
  },
  'reclamado, esperando respuesta': {
    label: 'Reclamado', riesgo: 'ninguno',
    que_significa: 'Ya se reclamó. La pelota está del otro lado.',
  },
  'reclamable y sin reclamar': {
    label: 'Reclamable, sin reclamar', riesgo: 'alto',
    que_significa: 'Se puede recuperar y todavía está a tiempo. Si nadie lo reclama, se pierde solo.',
  },
  'se perdio por dejarlo vencer': {
    label: 'Se perdió por dejarlo vencer', riesgo: 'alto',
    que_significa: 'Era recuperable y venció el plazo. Esta es la plata que el sector viene a dejar de perder.',
  },
  'no reclamable': {
    label: 'No reclamable', riesgo: 'ninguno',
    que_significa: 'El débito es correcto: no hay nada que discutir. Lo que corresponde es que no vuelva a pasar.',
  },
  'no se puede saber': {
    label: 'No se puede saber', riesgo: 'medio',
    que_significa: 'Falta un dato para decidir. No es que no se pueda reclamar: es que nadie lo miró todavía.',
  },
}

export interface PorMotivo {
  motivo: string
  motivo_nombre: string
  reclamable: Reclamable
  que_hacer: string
  cantidad: number
  plata: number
  recuperados: number
  plata_recuperada: number
  perdidos: number
  plata_perdida: number
  abiertos: number
  desde: string | null
  hasta: string | null
}

export interface DebitoFila {
  id: string
  convenio: string
  sucursal: string
  sucursal_id: string
  motivo: string
  motivo_nombre: string
  importe: number
  fecha_liquidacion: string
  estado: DebitoEstado
  reclamable: string | null
  vence_at: string | null
  dias: string | null
  por_que: string
  situacion: Situacion
}

export async function leerDebitos(
  sb: SupabaseClient,
  filtro: { desdeDias?: number } = {},
): Promise<{ filas: DebitoFila[]; truncado: boolean }> {
  let q = sb.from('convenio_recupero').select('*')
  if (filtro.desdeDias) {
    const d = new Date(Date.now() - filtro.desdeDias * 86400000).toISOString().slice(0, 10)
    q = q.gte('fecha_liquidacion', d)
  }
  // Un trimestre de débitos de cuatro sucursales pasa las 1.000 filas sin
  // esfuerzo, y PostgREST corta en 1.000 sin avisar.
  const { filas, truncado } = await paginar<any>(
    q.order('fecha_liquidacion', { ascending: false }).order('id'), { maximo: 100_000 },
  )
  return { filas: filas as DebitoFila[], truncado }
}

export async function leerPorMotivo(sb: SupabaseClient): Promise<PorMotivo[]> {
  // La vista ya viene ordenada por plata: es la pregunta que importa.
  const { data } = await sb.from('convenio_debitos_por_motivo').select('*')
  return ((data ?? []) as any[]).map((r) => ({
    ...r,
    plata: Number(r.plata), plata_recuperada: Number(r.plata_recuperada),
    plata_perdida: Number(r.plata_perdida),
  }))
}

export interface PorSucursal {
  sucursal_id: string
  sucursal: string
  motivo: string
  motivo_nombre: string
  cantidad: number
  plata: number
  plata_promedio: number
  sucursales_con_ese_motivo: number
  /** Null cuando hay una sola sucursal con ese motivo: no hay con qué comparar. */
  veces_el_promedio: number | null
}

export async function leerPorSucursal(sb: SupabaseClient): Promise<PorSucursal[]> {
  const { data } = await sb.from('convenio_debitos_por_sucursal').select('*')
  return ((data ?? []) as any[]).map((r) => ({
    ...r,
    plata: Number(r.plata), plata_promedio: Number(r.plata_promedio),
    veces_el_promedio: r.veces_el_promedio == null ? null : Number(r.veces_el_promedio),
  }))
}

/**
 * Qué decir de una sucursal que debita más que las otras por el mismo motivo.
 *
 * El sistema MUESTRA el número. No acusa a nadie: la frase es sobre el proceso,
 * no sobre la persona, y eso no es una formalidad — una sucursal puede tener
 * tres veces más débitos por troquel porque atiende tres veces más obra social.
 */
export function loQueDiceLaDiferencia(p: PorSucursal): string | null {
  if (p.veces_el_promedio == null) {
    return null
  }
  if (p.veces_el_promedio < 1.5) return null
  return `${p.sucursal} tiene ${p.veces_el_promedio.toFixed(1)}× el promedio de las otras en «${p.motivo_nombre}». ` +
    'Puede ser un problema de proceso, o puede ser que despache más obra social que las demás: ' +
    'el número no lo dice. Lo que sí dice es dónde mirar.'
}
