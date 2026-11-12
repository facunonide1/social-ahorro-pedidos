/**
 * Lo que traduce un pedido de WooCommerce a un pedido de NORA. Lo usan el sync
 * (`lib/woo/sync.ts`, cada 3 minutos) y el webhook (`/api/woo-webhook`). Antes
 * cada uno tenía su copia de estas funciones: un arreglo en una no llegaba a
 * la otra. Sin red ni base: se prueba solo (`mapear.test.ts`).
 */
import { createHmac, timingSafeEqual } from 'crypto'

import type { OrderItem, TipoEnvio } from '@/lib/types'
import type { WooLineItem, WooOrder } from './client'

/**
 * Tipo de envío a partir del shipping_method de Woo: «express» → express;
 * «retiro» / «pickup» / «local_pickup» → retiro; si no, programado.
 */
export function tipoEnvio(o: Pick<WooOrder, 'shipping_lines'>): TipoEnvio {
  const raw = ((o.shipping_lines ?? [])
    .map((l) => `${l.method_id ?? ''} ${l.method_title ?? ''}`)
    .join(' ') || '').toLowerCase()
  if (raw.includes('express')) return 'express'
  if (raw.includes('pickup') || raw.includes('retiro') || raw.includes('local_pickup')) return 'retiro'
  return 'programado'
}

/** La hora (0–23) en Buenos Aires. Algunas versiones de ICU dicen «24» a medianoche. */
export function horaBuenosAires(iso: string): number {
  const h = Number(new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', hour12: false,
  }))
  return h === 24 ? 0 : h
}

/** Fuera de horario: creado antes de la apertura o desde el cierre, hora de Buenos Aires. */
export function fueraDeHorario(iso: string | null | undefined, apertura: number, cierre: number): boolean {
  if (!iso) return false
  const h = horaBuenosAires(iso)
  return h < apertura || h >= cierre
}

/** Ítems de Woo a ítems de NORA. Si `price` no viene, sale del total / cantidad. */
export function mapearItems(items: WooLineItem[]): OrderItem[] {
  return items.map((it) => ({
    product_id: it.product_id,
    name: it.name,
    qty: it.quantity,
    price: Number(it.price) || Number(it.total) / Math.max(1, it.quantity),
    sku: it.sku || undefined,
    meta: it.meta_data?.length ? { meta_data: it.meta_data } : undefined,
  }))
}

/**
 * ¿La firma del webhook es la de Woo? HMAC-SHA256 del body crudo, en base64,
 * en `x-wc-webhook-signature`. Comparación de tiempo constante: con `!==` el
 * tiempo de respuesta filtra cuántos caracteres coinciden.
 */
export function firmaValida(body: string, firma: string | null | undefined, secreto: string): boolean {
  if (!firma || !secreto) return false
  const esperada = Buffer.from(createHmac('sha256', secreto).update(body, 'utf8').digest('base64'))
  const recibida = Buffer.from(firma)
  return recibida.length === esperada.length && timingSafeEqual(recibida, esperada)
}
