/**
 * F · CONFIRMAR LO QUE LA VOZ PROPUSO.
 *
 * Un toque en pantalla, nunca la voz. Y lo que se ejecuta es lo que quedó
 * guardado en `voz_bitacora` al proponer: el navegador manda el id, no el
 * contenido.
 *
 * La tarea, el parámetro y su vuelta atrás los hace la base
 * (`voz_confirmar`), en una transacción. El pedido y la transferencia los
 * escribe el servidor con la sesión del dueño, por los mismos caminos que la
 * pantalla de compras y el agente Reparto: si la voz tuviera su propia forma
 * de crear una orden, en tres semanas habría dos y ninguna sería la buena.
 *
 * Siempre en borrador o en solicitada. Emitir, enviar y pagar no están acá.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

import { ejecutar } from '@/lib/agentes/ejecutor'

type Sb = Pick<SupabaseClient, 'rpc' | 'from'>

export type Confirmacion = { ok: boolean; texto: string; nodo?: string | null }

async function resolver(sb: Sb, id: string, ok: boolean, ejecutado: Record<string, unknown>) {
  const { error } = await sb.rpc('voz_resolver', { p_id: id, p_ok: ok, p_ejecutado: ejecutado })
  if (error) console.error('[cerebro] voz_resolver:', error.message)
}

export async function confirmar(sb: Sb, userId: string, id: string, descartar: boolean): Promise<Confirmacion> {
  if (descartar) {
    const { data, error } = await sb.rpc('voz_descartar', { p_id: id })
    if (error) return { ok: false, texto: `No pude registrarlo: ${error.message}` }
    return { ok: !!data, texto: data ? 'Listo, no lo hago. Queda anotado que dijiste que no.' : 'Esa propuesta ya estaba resuelta.' }
  }

  const { data: r, error } = await sb.rpc('voz_confirmar', { p_id: id })
  if (error) return { ok: false, texto: `No se hizo: ${error.message}` }
  if (!r?.delegar) return { ok: !!r?.ok, texto: r?.texto ?? (r?.ok ? 'Hecho.' : 'No se hizo.'), nodo: r?.nodo ?? null }

  const { data: fila } = await sb.from('voz_bitacora').select('propuesta, estado').eq('id', id).maybeSingle<any>()
  const p = fila?.propuesta
  if (!p || fila.estado !== 'propuesto') return { ok: false, texto: 'Esa propuesta ya no está esperando.' }

  // F.3 · el pedido, en borrador y sin droguería
  if (p.tipo === 'pedido') {
    const { data: oc, error: e1 } = await sb.from('ordenes_compra').insert({
      estado: 'borrador', origen: 'sugerencia_nora', created_by: userId,
      notas: `Preparado por la voz: ${p.cantidad} de ${p.producto}. Falta elegir la droguería y emitirla: eso lo firma una persona.`,
    }).select('id, codigo').maybeSingle<any>()
    if (e1 || !oc) {
      await resolver(sb, id, false, { texto: 'no se pudo crear el borrador', error: e1?.message })
      return { ok: false, texto: `No pude crear el borrador: ${e1?.message ?? 'sin detalle'}. No quedó nada a medias.` }
    }
    const { error: e2 } = await sb.from('orden_compra_items').insert({
      orden_id: oc.id, producto_id: p.producto_id, descripcion: p.producto,
      cantidad_total: p.cantidad, costo_unitario: p.costo_unitario ?? null,
    })
    if (e2) {
      await resolver(sb, id, false, { texto: 'el borrador quedó sin renglón', orden_id: oc.id, error: e2.message })
      return { ok: false, texto: `Creé el borrador ${oc.codigo ?? ''} pero no pude cargarle el renglón: ${e2.message}.` }
    }
    const texto = `pedido ${oc.codigo ?? ''} en borrador: ${p.cantidad} de ${p.producto}, sin droguería y sin emitir`
    await resolver(sb, id, true, { texto, orden_id: oc.id, codigo: oc.codigo })
    return { ok: true, texto: `Listo: ${texto}.`, nodo: 'abasto' }
  }

  // F.3 · la transferencia, por el ejecutor de Reparto, en «prepara»
  if (p.tipo === 'transferencia') {
    const r2 = await ejecutar({
      adm: sb, agenteId: 'reparto', accion: 'armar_pedido_entre_sucursales',
      sucursalId: p.hacia, userId, nivel: 'prepara', limiteMonto: null,
    })
    await resolver(sb, id, r2.ok, { texto: r2.texto, entidad: r2.entidad ?? null, error: r2.error ?? null })
    return { ok: r2.ok, texto: r2.texto, nodo: p.hacia }
  }

  return { ok: false, texto: 'No sé ejecutar esa propuesta.' }
}
