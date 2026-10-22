import type { SupabaseClient } from '@supabase/supabase-js'

import { paginar } from '@/lib/supabase/paginar'

/**
 * LA PRESENTACIÓN · LECTURA.
 *
 * ── LO QUE ESTE ARCHIVO NO LEE ──────────────────────────────────────────────
 *
 * Paciente, médico, diagnóstico. No existen como columnas (migración 0209) y
 * no se agregan. Un comprobante acá es número, fecha, obra social, sucursal e
 * importes: lo que hace falta para presentar y para reclamar.
 */

export type PresentacionEstado = 'borrador' | 'armada' | 'enviada' | 'liquidada' | 'cerrada'
export type MotivoExclusion =
  | 'fuera_de_plazo' | 'falta_troquel' | 'falta_firma' | 'fuera_de_vademecum'
  | 'sin_autorizacion' | 'importe_en_cero' | 'duplicado' | 'otro'

export const ESTADO_LABEL: Record<PresentacionEstado, string> = {
  borrador: 'Borrador', armada: 'Armada', enviada: 'Enviada',
  liquidada: 'Liquidada', cerrada: 'Cerrada',
}

/**
 * B.3 · Los motivos por los que un comprobante queda afuera.
 *
 * Catálogo y no texto libre, por la misma razón que los motivos de débito: lo
 * que importa es poder contar cuántos quedaron afuera por cada motivo. Diez
 * comprobantes afuera por «falta troquel» en la misma sucursal es un problema
 * de proceso; escritos a mano de diez formas distintas, no son nada.
 */
export const EXCLUSIONES: { clave: MotivoExclusion; label: string; que_es: string }[] = [
  { clave: 'fuera_de_plazo', label: 'Fuera de plazo',
    que_es: 'Pasó el plazo de presentación del convenio. Esto ya es plata perdida: no entra y no se reclama.' },
  { clave: 'falta_troquel', label: 'Falta el troquel',
    que_es: 'Si el troquel aparece antes del cierre, el comprobante entra. Vale la pena buscarlo.' },
  { clave: 'falta_firma', label: 'Falta la firma',
    que_es: 'Falta la conformidad firmada. Se guarda que faltaba, no quién tenía que firmar.' },
  { clave: 'fuera_de_vademecum', label: 'Fuera de vademécum',
    que_es: 'El producto no está en la lista que cubre el convenio. No entra y no se recupera.' },
  { clave: 'sin_autorizacion', label: 'Sin autorización previa',
    que_es: 'El convenio pedía autorización antes de despachar y no está.' },
  { clave: 'importe_en_cero', label: 'Importe en cero',
    que_es: 'El comprobante entró sin importe. Presentarlo en cero no suma nada y ensucia el total.' },
  { clave: 'duplicado', label: 'Duplicado',
    que_es: 'El mismo número ya está en otra presentación.' },
  { clave: 'otro', label: 'Otro',
    que_es: 'Lo que no entra en los de arriba. Se escribe en el detalle, y el detalle se lee.' },
]

export interface PresentacionFila {
  id: string
  convenio_id: string
  convenio: string
  sucursal_id: string
  sucursal: string
  periodo_desde: string
  periodo_hasta: string
  estado: PresentacionEstado
  fecha_envio: string | null
  total_declarado: number | null
  cantidad_comprobantes: number | null
  tarea_control_id: string | null
  /** Cuántos comprobantes quedaron afuera, y por qué. */
  excluidos: number
  /** Troqueles: mandados y con acuse. Null = no hay envío registrado. */
  troqueles: { enviados: boolean; con_acuse: boolean } | null
}

export async function leerPresentaciones(
  sb: SupabaseClient,
  filtro: { sucursalId?: string | null } = {},
): Promise<PresentacionFila[]> {
  let q = sb.from('convenio_presentaciones')
    .select('*, convenios(nombre), sucursales(nombre)')
    .order('periodo_desde', { ascending: false })
  if (filtro.sucursalId) q = q.eq('sucursal_id', filtro.sucursalId)

  // Se pagina: una farmacia con 30 convenios × 4 sucursales × 12 meses pasa
  // las 1.000 filas en tres años, y el corte de PostgREST no avisa.
  const { filas } = await paginar<any>(q.order('id'), { maximo: 20_000 })
  if (!filas.length) return []

  const ids = filas.map((p) => p.id)
  const [{ data: exc }, { data: troq }] = await Promise.all([
    sb.from('convenio_comprobantes')
      .select('presentacion_id').in('presentacion_id', ids).eq('estado', 'excluido'),
    sb.from('convenio_troqueles')
      .select('presentacion_id, enviado_at, acuse_at').in('presentacion_id', ids),
  ])

  return filas.map((p) => {
    const t = (troq ?? []).filter((x: any) => x.presentacion_id === p.id)
    return {
      id: p.id,
      convenio_id: p.convenio_id,
      convenio: p.convenios?.nombre ?? '—',
      sucursal_id: p.sucursal_id,
      sucursal: p.sucursales?.nombre ?? '—',
      periodo_desde: p.periodo_desde,
      periodo_hasta: p.periodo_hasta,
      estado: p.estado,
      fecha_envio: p.fecha_envio,
      total_declarado: p.total_declarado == null ? null : Number(p.total_declarado),
      cantidad_comprobantes: p.cantidad_comprobantes,
      tarea_control_id: p.tarea_control_id,
      excluidos: (exc ?? []).filter((x: any) => x.presentacion_id === p.id).length,
      troqueles: t.length === 0 ? null : {
        enviados: t.some((x: any) => x.enviado_at != null),
        con_acuse: t.some((x: any) => x.acuse_at != null),
      },
    }
  })
}

/**
 * Qué dice una presentación sobre sus troqueles, en una frase.
 *
 * Importa porque es lo que decide si un débito va a ser reclamable, y eso se
 * decide ANTES de que llegue el débito. Cuando el débito llega, el acuse ya
 * está o ya no está.
 */
export function estadoDeTroqueles(t: PresentacionFila['troqueles']): {
  texto: string; riesgo: boolean
} {
  if (t === null) {
    return {
      texto: 'No hay ningún envío de troqueles registrado. Si esta obra social debita por troquel faltante, no va a haber con qué reclamar.',
      riesgo: true,
    }
  }
  if (!t.enviados) {
    return { texto: 'El envío está empezado pero sin fecha de salida.', riesgo: true }
  }
  if (!t.con_acuse) {
    return {
      texto: 'Los troqueles se mandaron y falta el acuse de recibo. El acuse es lo que convierte un débito en reclamable.',
      riesgo: true,
    }
  }
  return { texto: 'Troqueles mandados y acuse guardado.', riesgo: false }
}
