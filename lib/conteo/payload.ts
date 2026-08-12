import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * LO ÚNICO QUE VE QUIEN CUENTA.
 *
 * Existe como función y no repetido en la ruta y en la página para que haya UN
 * solo lugar donde pueda colarse la cantidad esperada. Dos armados del mismo
 * payload es la forma más común de que uno de los dos filtre: se arregla el que
 * alguien miró y el otro sigue mandando el dato.
 *
 * Las columnas van enumeradas. Un `select('*')` sobre `cnt_renglones` arrastra
 * `cantidad_esperada` el día que alguien la escriba antes de tiempo, y el
 * conteo dejaría de ser ciego sin que nadie toque este archivo.
 */

export interface ItemParaContar {
  id: string
  sku: string | null
  descripcion: string
  unidad: string | null
  orden: number
  cantidad: number | null
  nota: string | null
  salteado: boolean
  motivoSalteo: string | null
}

export interface PayloadParaContar {
  conteo: { id: string; estado: string; zona: string; iniciadoAt: string }
  items: ItemParaContar[]
}

/** Las columnas que se leen de cada tabla. Escritas acá para poder auditarlas. */
export const COLUMNAS_ITEM = 'id, sku, descripcion, unidad, orden'
export const COLUMNAS_RENGLON = 'lista_item_id, cantidad_contada, nota, salteado, motivo_salteo'

export async function payloadParaContar(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: SupabaseClient<any, 'public', any>,
  conteoId: string,
): Promise<PayloadParaContar | null> {
  const { data: conteo } = await sb
    .from('cnt_conteos')
    .select('id, estado, lista_id, iniciado_at')
    .eq('id', conteoId)
    .maybeSingle()
  if (!conteo) return null
  const c = conteo as { id: string; estado: string; lista_id: string; iniciado_at: string }

  const [{ data: lista }, { data: items }, { data: renglones }] = await Promise.all([
    sb.from('cnt_listas').select('zona').eq('id', c.lista_id).maybeSingle(),
    sb
      .from('cnt_lista_items')
      .select(COLUMNAS_ITEM)
      .eq('lista_id', c.lista_id)
      .eq('activo', true)
      .order('orden'),
    sb.from('cnt_renglones').select(COLUMNAS_RENGLON).eq('conteo_id', conteoId),
  ])

  const contado = new Map(
    ((renglones ?? []) as {
      lista_item_id: string
      cantidad_contada: number | null
      nota: string | null
      salteado: boolean
      motivo_salteo: string | null
    }[]).map((r) => [r.lista_item_id, r]),
  )

  return {
    conteo: {
      id: c.id,
      estado: c.estado,
      zona: (lista as { zona: string } | null)?.zona ?? 'zona',
      iniciadoAt: c.iniciado_at,
    },
    items: ((items ?? []) as {
      id: string
      sku: string | null
      descripcion: string
      unidad: string | null
      orden: number
    }[]).map((i) => {
      const r = contado.get(i.id)
      return {
        id: i.id,
        sku: i.sku,
        descripcion: i.descripcion,
        unidad: i.unidad,
        orden: i.orden,
        cantidad: r?.cantidad_contada ?? null,
        nota: r?.nota ?? null,
        salteado: r?.salteado ?? false,
        motivoSalteo: r?.motivo_salteo ?? null,
      }
    }),
  }
}
