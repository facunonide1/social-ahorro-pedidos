/**
 * LAS 68 COLUMNAS DE pla_3d_24, POR ÍNDICE.
 *
 * El archivo no tiene encabezados confiables: la fila 0 los trae, pero la fila 1
 * es un encabezado de reporte («*** 28/08/26 ***», código 9999999) que hay que
 * descartar. Los datos empiezan en la fila 2.
 *
 * El mapa va por ÍNDICE y no por nombre de encabezado a propósito: los nombres
 * vienen con la codificación rota, y aparear por un texto que hay que arreglar
 * antes de poder compararlo es apoyar el mapa en lo que estamos arreglando.
 */

/**
 * Los datos empiezan después del encabezado, y NO en la fila 2.
 *
 * El relevamiento decía que la fila 1 era un encabezado de reporte
 * («*** 28/08/26 ***», código 9999999). En el .xls original estaba; en el CSV
 * convertido no está: la fila 1 ya es un producto real («+50 compx30», código
 * 9948773). Con la constante en 2 se perdían dos productos sin que nadie se
 * enterara — el archivo tiene 46.035 y habría cargado 46.033.
 *
 * Entonces se salta sólo el encabezado, y la fila de reporte —si viene— la
 * descarta `esFilaDeEncabezado`, que mira el contenido en vez de la posición.
 * Un número de fila es una suposición sobre el archivo; el contenido es el
 * archivo.
 */
export const FILA_PRIMER_DATO = 1

/** Índice → nombre del campo. El orden es el del archivo. */
export const MAESTRO: Record<number, string> = {
  0: 'descrip', 1: 'este',
  2: 'jul26', 3: 'jun26', 4: 'may26', 5: 'abr26', 6: 'mar26', 7: 'feb26',
  8: 'ene26', 9: 'dic25', 10: 'nov25', 11: 'oct25', 12: 'sep25', 13: 'ago25',
  14: 'stock', 15: 'pun_ped', 16: 'st_min', 17: 'prec_vta', 18: 'costo',
  19: 'margen', 20: 'iva_prod', 21: 'utilidad', 22: 'publico',
  23: 'fec_actu', 24: 'codigo', 25: 'barras', 26: 'barras2',
  27: 'registro', 28: 'categoria', 29: 'num_lab', 30: 'nom_lab',
  31: 'num_depto', 32: 'nom_depto', 33: 'iva_depto', 34: 'num_grupo',
  35: 'nom_grupo', 36: 'rubro', 37: 'ubic', 38: 'seccion', 39: 'aux1',
  40: 'gcom', 41: 'vl', 42: 'psi', 43: 'od', 44: 'ult_vta', 45: 'ult_cpa',
  46: 'fec_alta', 47: 'prod_nom', 48: 'prod_pres', 49: 'descripx',
  50: 'droga', 51: 'familia', 52: 'forma', 53: 'potencia', 54: 'uni_pot',
  55: 'unidades', 56: 'tip_uni', 57: 'varios', 58: 'marca_3', 59: 'pami',
  60: 'pre_pami', 61: 'ioma', 62: 'dmv_30', 63: 'unine_3', 64: 'categ_3',
  65: 'segme_3', 66: 'ssegm_3', 67: 'ppedir',
}

/**
 * Los doce meses cerrados, del más nuevo al más viejo, más el mes en curso.
 *
 * `ago25` viene CORTADO: 3.509 unidades contra ~28.000 de los demás. No es un
 * mes flojo, es un mes incompleto — el corte de la serie. Entra marcado como
 * parcial y no se usa para promediar. Si entrara como mes normal, cualquier
 * promedio de doce meses queda mal y nadie lo iba a notar.
 */
export const MESES_MAESTRO = [
  { campo: 'jul26', periodo: '2026-07', parcial: false },
  { campo: 'jun26', periodo: '2026-06', parcial: false },
  { campo: 'may26', periodo: '2026-05', parcial: false },
  { campo: 'abr26', periodo: '2026-04', parcial: false },
  { campo: 'mar26', periodo: '2026-03', parcial: false },
  { campo: 'feb26', periodo: '2026-02', parcial: false },
  { campo: 'ene26', periodo: '2026-01', parcial: false },
  { campo: 'dic25', periodo: '2025-12', parcial: false },
  { campo: 'nov25', periodo: '2025-11', parcial: false },
  { campo: 'oct25', periodo: '2025-10', parcial: false },
  { campo: 'sep25', periodo: '2025-09', parcial: false },
  { campo: 'ago25', periodo: '2025-08', parcial: true },
] as const

/** Las cuatro sucursales, con el código que usa SIFACO en tabla3e. */
export const SUCURSALES_SIFACO = ['GUZ', 'FIG', 'ARA', 'TES'] as const
export type CodigoSucursal = (typeof SUCURSALES_SIFACO)[number]

// ── Conversión de formatos ───────────────────────────────────────────────────
//
// Se convierte al cargar y no después. Un serial de Excel guardado como texto
// en una columna `date` no falla: entra como null o como una fecha absurda, y
// eso se descubre tres pantallas más adelante.

/** «Nunca» en SIFACO. También cubre la celda vacía y el guión suelto. */
const VACIOS = new Set(['', '-', '  -   -', '-   -', '  -  -', '0', '00/00/00'])

/**
 * Fecha desde un serial de Excel (46262 = una fecha de 2026) o desde texto.
 *
 * El epoch de Excel es el 30-dic-1899, con el bug del año bisiesto 1900 ya
 * incorporado en esa constante: no hay que corregirlo aparte para fechas
 * posteriores a marzo de 1900, que son todas las que nos importan.
 */
export function fechaSifaco(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null

  if (typeof valor === 'number' && Number.isFinite(valor)) {
    if (valor <= 0) return null
    const ms = Math.round((valor - 25569) * 86_400_000)
    const d = new Date(ms)
    if (Number.isNaN(d.getTime())) return null
    const a = d.getUTCFullYear()
    if (a < 1990 || a > 2100) return null
    return d.toISOString().slice(0, 10)
  }

  const t = String(valor).trim()
  if (VACIOS.has(t) || !t.replace(/[\s\-/]/g, '')) return null

  // ISO, que es como vienen los CSV ya convertidos. Faltaba: el `\d{1,2}` de
  // abajo no puede matchear «2026», asi que 2026-08-24 caia al `Number(t)`,
  // daba NaN y devolvia null. Las 329 ofertas con fecha de fin entraban todas
  // como «sin vencimiento» — el archivo tenia el dato y nosotros lo perdiamos.
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    const a = Number(t.slice(0, 4))
    return a >= 1990 && a <= 2100 ? t : null
  }

  // dd/mm/yy o dd/mm/yyyy
  const m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
  if (m) {
    const dd = Number(m[1]); const mm = Number(m[2])
    let aa = Number(m[3])
    if (aa < 100) aa += aa < 70 ? 2000 : 1900
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null
    return `${aa}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
  }

  const n = Number(t)
  if (Number.isFinite(n) && n > 0) return fechaSifaco(n)
  return null
}

/**
 * Número desde lo que venga. En compra_venta el CODIGO viene como texto y
 * varios importes también; comparar un texto contra un número da falso sin
 * avisar.
 *
 * Devuelve null en vez de 0 cuando no hay dato: cero es un valor, «no vino» es
 * otra cosa, y en stock y en costo la diferencia decide.
 */
export function numeroSifaco(valor: unknown): number | null {
  if (valor === null || valor === undefined) return null
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null

  let t = String(valor).trim()
  if (!t || VACIOS.has(t)) return null
  // Formato argentino: 1.234,56
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')
  t = t.replace(/[^\d.\-]/g, '')
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/**
 * El código de producto, normalizado para poder cruzar los tres archivos.
 *
 * En el maestro y en tabla3e viene como número; en compra_venta como texto.
 * Los códigos NEGATIVOS son válidos (bonificados y ajustes), así que no se
 * puede filtrar por «mayor que cero» ni sacar el signo.
 */
export function codigoSifaco(valor: unknown): string | null {
  const n = numeroSifaco(valor)
  if (n === null) return null
  if (!Number.isInteger(n)) return String(n)
  return String(n)
}

/** La fila de encabezado de reporte que SIFACO mete en la fila 1. */
export function esFilaDeEncabezado(codigo: string | null, descrip: string | null): boolean {
  if (codigo === '9999999') return true
  if (descrip && /^\*\*\*.*\*\*\*$/.test(descrip.trim())) return true
  return false
}
