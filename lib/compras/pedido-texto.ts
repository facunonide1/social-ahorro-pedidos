/**
 * EL PEDIDO, COMO TEXTO PARA MANDAR POR WHATSAPP.
 *
 * ── POR QUÉ TEXTO Y NO UNA INTEGRACIÓN ──────────────────────────────────────
 *
 * Hoy se pide por WhatsApp o por la web de la droguería. Integrar WhatsApp está
 * explícitamente fuera de alcance —y sería la tercera integración que se
 * promete y no se usa—. Lo que sí sirve: que el pedido salga armado y listo
 * para pegar, con el SKU adelante, que es lo que la droguería necesita para
 * cargarlo sin volver a preguntar.
 */

export interface RenglonDePedido {
  sku: string | null
  codigo_barras?: string | null
  nombre: string
  cantidad: number
}

export function textoDePedido(opts: {
  proveedor: string
  sucursal: string
  renglones: RenglonDePedido[]
  nota?: string | null
}): string {
  const lineas = opts.renglones
    .filter((r) => r.cantidad > 0)
    .map((r) => `${r.sku ?? 's/sku'} · ${r.nombre} · ${r.cantidad}`)

  return [
    `Pedido para ${opts.proveedor}`,
    `Entrega en: ${opts.sucursal}`,
    '',
    ...lineas,
    '',
    `Total de renglones: ${lineas.length}`,
    opts.nota ? `\n${opts.nota}` : '',
  ].filter((x) => x !== null).join('\n').trim()
}
