/**
 * LOS CUATRO CANALES, QUE SON UN CAMPO.
 *
 * ── POR QUÉ NO HAY UN MÓDULO POR CANAL ──────────────────────────────────────
 *
 * WhatsApp, la tienda web, PedidosYa y el mostrador venden lo mismo, con el
 * mismo stock, al mismo cliente y con la misma gente armando la bolsa. Lo único
 * distinto es por dónde llegó el pedido. Eso es un campo (`orders.origin`), no
 * cuatro modelos.
 *
 * Hoy se manejan en tres lugares: Woo tiene su webhook, PedidosYa vive en su
 * portal y lo de WhatsApp se carga a mano o no se carga. Los tres terminan en la
 * misma tabla.
 */

import type { OrderOrigin } from '@/lib/types'

/** El orden en que se muestran. Primero los que más entran. */
export const CANALES: OrderOrigin[] = [
  'whatsapp', 'woo', 'pedidosya', 'mostrador', 'telefono', 'instagram', 'otro',
]

export const CANAL_LABELS: Record<OrderOrigin, string> = {
  whatsapp:  'WhatsApp',
  woo:       'Tienda web',
  pedidosya: 'PedidosYa',
  mostrador: 'Mostrador',
  telefono:  'Teléfono',
  instagram: 'Instagram',
  otro:      'Otro',
}

/**
 * Cuáles entran solos y cuáles se cargan a mano. No es un detalle: define qué
 * se le puede pedir al sistema y qué depende de que alguien lo escriba.
 */
export const CANAL_ENTRADA: Record<OrderOrigin, 'automatico' | 'a_mano'> = {
  woo:       'automatico',  // webhook de WooCommerce, ya funcionando
  whatsapp:  'a_mano',      // la app común, sin API
  pedidosya: 'a_mano',      // su portal; la API NO está integrada
  mostrador: 'a_mano',
  telefono:  'a_mano',
  instagram: 'a_mano',
  otro:      'a_mano',
}

/** Los que hoy no tienen forma automática de entrar, con el motivo. */
export const CANAL_PENDIENTE: Partial<Record<OrderOrigin, string>> = {
  pedidosya: 'La API de PedidosYa no está integrada. Los pedidos se cargan a mano desde su portal.',
  whatsapp:  'WhatsApp es la app común, sin API. El pedido se carga a mano.',
}

type Adm = { from: (t: string) => any }

/**
 * De qué sucursal sale un pedido que entra solo.
 *
 * ── LO QUE NO SE PUEDE HACER ────────────────────────────────────────────────
 *
 * Deducirla del stock. El stock que tiene NORA es el total de las cuatro
 * sucursales, sin apertura: falta el archivo `tabla3e` completo. Elegir "la que
 * tiene stock" sería inventar un dato que no existe.
 *
 * Entonces sale de una REGLA DE CANAL —`canales_venta.sucursal_despacho_id`, que
 * una persona configura— o de nadie. Si nadie la configuró, el pedido entra sin
 * sucursal y queda en `pedidos_sin_sucursal`, a la vista. Rebotar el webhook por
 * esto sería perder el pedido, que es peor.
 */
export async function sucursalDeCanal(adm: Adm, canalId: string): Promise<string | null> {
  const { data } = await adm
    .from('canales_venta').select('sucursal_despacho_id').eq('id', canalId).maybeSingle()
  return data?.sucursal_despacho_id ?? null
}
