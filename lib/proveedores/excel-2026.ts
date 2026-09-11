/**
 * LEER EL EXCEL DE FACTURAS Y PAGOS.
 *
 * ── QUÉ ES ESE ARCHIVO ──────────────────────────────────────────────────────
 *
 * «FACTURAS Y PAGOS GUZGON.xlsx»: 59 hojas, una por proveedor, cargadas a mano
 * una vez por semana desde junio de 2023. Es el único lugar donde hoy existe la
 * deuda con los proveedores.
 *
 * ── LO QUE NO SE INVENTA ────────────────────────────────────────────────────
 *
 * El texto de la columna de pago es libre: «CAJA FLOR 3/8», «TRANSFERENCIA MP
 * 11/8», «RESUMEN Nº240808». De ahí se saca lo que se puede leer con certeza
 * —forma, fecha, persona, número de resumen— y **lo que no se entiende queda
 * como nota, sin interpretar**. Adivinar un pago es inventar que algo se pagó.
 *
 * Y un comprobante sin texto de pago **no es deuda**: se pagó y no se anotó. Es
 * lo que aclaró Facundo. Tratarlo como impago inventaría un pasivo enorme.
 */

export type FilaExcel = {
  hoja: string
  fecha: unknown
  proveedor: unknown
  tipo: unknown
  numero: unknown
  monto: unknown
  pago: unknown
  faltantes: unknown
}

/** Los 13 encabezados distintos que aparecen en las 59 hojas. */
export const ALIAS_COLUMNA: Record<string, string> = {
  'FECHA DE INGRESO': 'fecha', 'FECHA': 'fecha',
  'PROVEEDOR': 'proveedor', 'TIPO DE COMPROBANTE': 'tipo', 'FACTURA A': 'tipo',
  'NUMERO DE COMPROBANTE': 'numero', 'MONTO': 'monto',
  'PAGO (CAJAS USADAS)': 'pago', 'FALTANTES/DEVOLUCIONES': 'faltantes',
  'FECHA DE VTO': 'vencimiento', 'CONDICIÓN': 'condicion',
  'SALDO A PAGAR': 'saldo', 'FECHA DE PAGOS': 'fecha_pago', 'CONTROL': 'control',
}

/**
 * Un monto escrito a mano.
 *
 * En el archivo aparece como número, como «$13,507,93» y como «103,237,49»: la
 * coma se usa de separador de miles Y de decimales en la misma columna. Cuando
 * el patrón no es reconocible se devuelve null — un monto mal leído es peor que
 * ninguno, porque se suma.
 */
export function montoDelExcel(v: unknown): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  let s = String(v).trim().replace(/\$/g, '').replace(/\s/g, '')
  if (!/\d/.test(s)) return null
  const neg = s.startsWith('-')
  if (neg) s = s.slice(1)

  let n: number | null = null
  if (/^\d{1,3}(,\d{3})*,\d{2}$/.test(s)) {
    // 13,507,93 → la última coma es el decimal, las otras son miles
    const i = s.lastIndexOf(',')
    n = Number(s.slice(0, i).replace(/,/g, '') + '.' + s.slice(i + 1))
  } else if (/^\d{1,3}(\.\d{3})*,\d{2}$/.test(s)) {
    n = Number(s.replace(/\./g, '').replace(',', '.'))
  } else if (/^\d+,\d{1,2}$/.test(s)) {
    n = Number(s.replace(',', '.'))
  } else if (/^\d+(\.\d+)?$/.test(s)) {
    n = Number(s)
  } else {
    const limpio = s.replace(/[^\d.]/g, '')
    n = limpio && /^\d+(\.\d+)?$/.test(limpio) ? Number(limpio) : null
  }
  if (n === null || !Number.isFinite(n)) return null
  return neg ? -n : n
}

export type TipoLeido = 'factura_a' | 'factura_b' | 'factura_c' | 'nota_credito' | 'nota_debito' | 'remito' | 'recibo' | 'gasto'

/** Lo que dice la columna de tipo, mapeado al enum que ya existe. */
export function tipoDelExcel(v: unknown): { tipo: TipoLeido; letra: string | null } {
  const s = String(v ?? '').trim().toUpperCase().replace(/\s+/g, ' ')
  if (!s) return { tipo: 'factura_a', letra: 'A' }
  if (/REMITO/.test(s)) return { tipo: 'remito', letra: null }
  if (/NOTA ?DE? ?D[EÉ]BITO|^ND$/.test(s)) return { tipo: 'nota_debito', letra: null }
  // Recupero y crédito son las dos notas que RESTAN. 276 en el archivo.
  if (/RECUPERO|NOTA ?DE? ?CR[EÉ]DITO|^N\/?C$|NRFD/.test(s)) return { tipo: 'nota_credito', letra: null }
  if (/\bB\b/.test(s)) return { tipo: 'factura_b', letra: 'B' }
  if (/\bC\b/.test(s)) return { tipo: 'factura_c', letra: 'C' }
  return { tipo: 'factura_a', letra: 'A' }
}

export interface PagoLeido {
  /** `null` cuando el texto no permite decirlo con certeza. */
  forma: 'efectivo' | 'transferencia' | 'mercadopago' | 'cheque' | 'nota_credito' | null
  caja: string | null
  resumen: string | null
  /** Día y mes sin año: el texto casi nunca lo trae. */
  dia: string | null
  /** El texto entero, siempre. Es lo que queda cuando no se entiende. */
  original: string
  entendido: boolean
}

/**
 * Lee el texto libre de la columna de pago.
 *
 * Devuelve `entendido: false` cuando no se pudo sacar la forma de pago. Ese
 * caso NO se completa con una suposición: queda el texto y alguien lo mira.
 */
export function pagoDelExcel(v: unknown): PagoLeido | null {
  const original = String(v ?? '').trim()
  if (!original) return null
  const s = original.toUpperCase()

  const caja = s.match(/CAJA\s+([A-ZÁÉÍÓÚÑ]+)/)?.[1] ?? null
  const resumen = s.match(/RESUMEN\s*(?:N[º°]?\s*)?([\w-]+)/)?.[1] ?? null
  const dia = s.match(/(\d{1,2}\/\d{1,2})(?!\d)/)?.[1] ?? null

  let forma: PagoLeido['forma'] = null
  if (/TRANSFEREN/.test(s)) forma = 'transferencia'
  else if (/\bMP\b|MERCADO ?PAGO/.test(s)) forma = 'mercadopago'
  else if (/ECHEQ|E-?CHEQ|CHEQUE/.test(s)) forma = 'cheque'
  else if (/N\/?C\b|NOTA ?DE? ?CR[EÉ]DITO|COMPENSA/.test(s)) forma = 'nota_credito'
  else if (/EFVO|EFECTIVO|\bCAJA\b/.test(s)) forma = 'efectivo'

  return { forma, caja, resumen, dia, original, entendido: forma !== null }
}
