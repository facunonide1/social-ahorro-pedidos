/**
 * La fecha de un precio es la de la lista o la de la factura, nunca el día
 * en que alguien la cargó. Una lista más vieja que la vigente se guarda, pero
 * no la desplaza. El precio de factura es el unitario neto: lo pagado, con
 * el descuento ya restado.
 */

export type OrigenPrecio = 'lista' | 'factura'

export type EventoPrecio = {
  productoId: string
  proveedorId: string
  origen: OrigenPrecio
  fecha: string
  precio: number
}

const MESES: Record<string, string> = {
  enero: '01', febrero: '02', marzo: '03', abril: '04', mayo: '05', junio: '06',
  julio: '07', agosto: '08', septiembre: '09', setiembre: '09', octubre: '10',
  noviembre: '11', diciembre: '12',
}

/** `2026-11-06`, `06/11/2026` o `06 de noviembre de 2026`. */
export function fechaIso(valor: string | null | undefined): string | null {
  if (!valor) return null
  const t = valor.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const dmy = t.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  const larga = t.match(/(\d{1,2})\s+de\s+([a-z]+)\s+de\s+(\d{4})/)
  if (larga && MESES[larga[2]]) return `${larga[3]}-${MESES[larga[2]]}-${larga[1].padStart(2, '0')}`
  return null
}

/**
 * `reemplaza` si no hay vigente o la nueva es igual o posterior.
 * `historial` si la nueva es anterior: se guarda y la vigente queda.
 */
export function decidirVigencia(
  vigente: { fecha: string | null } | null,
  nuevaFecha: string,
): 'reemplaza' | 'historial' {
  const actual = fechaIso(vigente?.fecha ?? null)
  const nueva = fechaIso(nuevaFecha)
  if (!nueva) return vigente ? 'historial' : 'reemplaza'
  if (!actual) return 'reemplaza'
  return nueva >= actual ? 'reemplaza' : 'historial'
}

/**
 * Unitario neto pagado. Si hay importe y cantidad, el neto es importe/cantidad
 * (ya trae el descuento). Si no, se aplica el descuento al unitario.
 * 10 o 0.10 significan diez por ciento.
 */
export function precioNetoPagado(p: {
  unitario: number | null
  descuento?: number | null
  importe?: number | null
  cantidad?: number | null
}): number | null {
  const cant = p.cantidad ?? null
  if (p.importe != null && p.importe > 0 && cant != null && cant > 0) {
    return Math.round((p.importe / cant) * 100) / 100
  }
  if (p.unitario == null || !(p.unitario > 0)) return null
  const d = p.descuento
  if (d != null && d > 0) {
    const frac = d > 1 ? d / 100 : d
    return Math.round(p.unitario * (1 - frac) * 100) / 100
  }
  return Math.round(p.unitario * 100) / 100
}

export type VistaPrecios = {
  lista: EventoPrecio | null
  factura: EventoPrecio | null
  anteriores: EventoPrecio[]
}

/** El último de cada origen, y el resto ordenado de más nuevo a más viejo. */
export function partirPorFecha(eventos: EventoPrecio[]): VistaPrecios {
  const orden = [...eventos].sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0))
  let lista: EventoPrecio | null = null
  let factura: EventoPrecio | null = null
  const anteriores: EventoPrecio[] = []
  for (const e of orden) {
    if (e.origen === 'lista' && !lista) lista = e
    else if (e.origen === 'factura' && !factura) factura = e
    else anteriores.push(e)
  }
  return { lista, factura, anteriores }
}
