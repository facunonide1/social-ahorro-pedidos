import { createAdminClient } from '@/lib/supabase/server'

import { aplicarConsecuencias, type Consecuencias } from './consecuencias'
import { resolverEsperado, type Ambito } from './esperado'

/**
 * CERRAR UNA ZONA.
 *
 * Es el único momento en que la cantidad esperada entra al sistema. Antes no
 * existe en ninguna fila, y el trigger `cnt_renglones_ciego` lo garantiza.
 *
 * El orden importa y no es casual:
 *   1. se marca el conteo como cerrado
 *   2. RECIÉN AHÍ se escriben esperadas y diferencias
 *
 * Al revés no se puede: el trigger rechaza escribir la esperada mientras el
 * conteo no esté cerrado. Es a propósito — si el orden pudiera invertirse,
 * habría un instante con las esperadas escritas y el conteo todavía abierto, y
 * ese instante es exactamente el que hay que evitar.
 */

export interface RenglonCerrado {
  listaItemId: string
  sku: string | null
  descripcion: string
  contada: number | null
  esperada: number | null
  diferencia: number | null
  valor: number
  salteado: boolean
  motivo?: string
}

export interface Resultado {
  conteoId: string
  zona: string
  puntoId: string | null
  total: number
  coinciden: number
  conDiferencia: number
  sinComparar: number
  valorDiferencia: number
  renglones: RenglonCerrado[]
}

export async function cerrarConteo(
  conteoId: string,
  autorId: string | null = null,
): Promise<{ ok: true; resultado: Resultado; consecuencias: Consecuencias } | { ok: false; error: string }> {
  const adm = createAdminClient()

  const { data: conteo } = await adm
    .from('cnt_conteos')
    .select('id, estado, lista_id, punto_id')
    .eq('id', conteoId)
    .maybeSingle<{ id: string; estado: string; lista_id: string; punto_id: string | null }>()
  if (!conteo) return { ok: false, error: 'El conteo no existe.' }
  if (conteo.estado === 'cerrado') return { ok: false, error: 'Ese conteo ya estaba cerrado.' }
  if (conteo.estado === 'anulado') return { ok: false, error: 'Ese conteo está anulado.' }

  const { data: lista } = await adm
    .from('cnt_listas')
    .select('zona, ambito')
    .eq('id', conteo.lista_id)
    .maybeSingle<{ zona: string; ambito: Ambito }>()

  const { data: items } = await adm
    .from('cnt_lista_items')
    .select('id, sku, descripcion')
    .eq('lista_id', conteo.lista_id)
    .eq('activo', true)
    .order('orden')
  const listaItems = (items ?? []) as { id: string; sku: string | null; descripcion: string }[]

  const { data: rgs } = await adm
    .from('cnt_renglones')
    .select('lista_item_id, cantidad_contada, salteado')
    .eq('conteo_id', conteoId)
  const contados = new Map(
    ((rgs ?? []) as { lista_item_id: string; cantidad_contada: number | null; salteado: boolean }[]).map((r) => [
      r.lista_item_id,
      r,
    ]),
  )

  // No se cierra a medias. Un item sin contar y sin saltear no es un cero: es
  // un item que nadie miró, y cerrarlo así lo convertiría en un faltante
  // inventado del tamaño de todo su stock.
  const sinTocar = listaItems.filter((i) => !contados.has(i.id))
  if (sinTocar.length > 0) {
    return {
      ok: false,
      error: `Faltan ${sinTocar.length} item(s) por contar o saltear. El primero: ${sinTocar[0].descripcion}.`,
    }
  }

  const esperados = await resolverEsperado({
    listaItemIds: listaItems.map((i) => i.id),
    puntoId: conteo.punto_id,
    ambito: lista?.ambito ?? 'total',
  })

  const renglones: RenglonCerrado[] = listaItems.map((i) => {
    const r = contados.get(i.id)!
    const e = esperados.get(i.id) ?? { cantidad: null, precio: 0, motivo: 'no se resolvió' }
    const contada = r.salteado ? null : Number(r.cantidad_contada ?? 0)
    const esperada = e.cantidad
    const diferencia = contada === null || esperada === null ? null : contada - esperada
    return {
      listaItemId: i.id,
      sku: i.sku,
      descripcion: i.descripcion,
      contada,
      esperada,
      diferencia,
      valor: diferencia === null ? 0 : Math.round(diferencia * e.precio * 100) / 100,
      salteado: r.salteado,
      motivo: e.motivo,
    }
  })

  /* ── 1 · el conteo se cierra ──────────────────────────────────────────── */
  const conDiferencia = renglones.filter((r) => r.diferencia !== null && r.diferencia !== 0)
  const coinciden = renglones.filter((r) => r.diferencia === 0).length
  // Ni coincide ni difiere: no se pudo comparar. Meterlos en "coinciden" sería
  // el error de siempre — un cero que significa "no miré" leído como "está bien".
  const sinComparar = renglones.filter((r) => r.diferencia === null).length
  const valorDiferencia = Math.round(conDiferencia.reduce((a, r) => a + r.valor, 0) * 100) / 100

  const { error: errCierre } = await adm
    .from('cnt_conteos')
    .update({
      estado: 'cerrado',
      cerrado_at: new Date().toISOString(),
      total_items: renglones.length,
      items_coinciden: coinciden,
      items_diferencia: conDiferencia.length,
      valor_diferencia: valorDiferencia,
    })
    .eq('id', conteoId)
  if (errCierre) return { ok: false, error: 'No se pudo cerrar el conteo.' }

  /* ── 2 · recién ahora se escriben las esperadas ───────────────────────── */
  for (const r of renglones) {
    await adm
      .from('cnt_renglones')
      .update({
        cantidad_esperada: r.esperada,
        diferencia: r.diferencia,
        valor_diferencia: r.valor,
      })
      .eq('conteo_id', conteoId)
      .eq('lista_item_id', r.listaItemId)
  }

  const resultado: Resultado = {
    conteoId,
    zona: lista?.zona ?? 'zona',
    puntoId: conteo.punto_id,
    total: renglones.length,
    coinciden,
    conDiferencia: conDiferencia.length,
    sinComparar,
    valorDiferencia,
    // Ordenado por lo que cuesta, no por SKU: quien lee esto tiene que ver
    // primero lo que más pesa.
    renglones: [...renglones].sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor)),
  }

  /* ── 3 · las consecuencias ────────────────────────────────────────────── */
  // Van después de que el conteo esté cerrado y las esperadas escritas. Si
  // fallara la creación de una tarea, el conteo ya quedó bien cerrado: se puede
  // volver a pedir la tarea, no se puede volver a contar la góndola.
  const consecuencias = await aplicarConsecuencias(resultado, autorId)

  return { ok: true, resultado, consecuencias }
}
