'use client'

import * as XLSX from 'xlsx'

/**
 * LOS ARCHIVOS QUE SIFACO PUEDE IMPORTAR.
 *
 * ── QUÉ CIERRA ESTO ────────────────────────────────────────────────────────
 *
 * Desde la v0.88 quedó abierto «qué formato acepta SIFACO para importar». La
 * respuesta llegó en el cuestionario: **acepta de todo**, con columnas
 * genéricas tipo vademécum. Así que el camino de vuelta existe, y lo único que
 * hacía falta era armar el archivo.
 *
 * NORA sigue sin escribir en SIFACO. Esto genera un archivo que una persona
 * sube: el que decide que esos precios van es quien aprieta importar allá.
 *
 * ── EL SKU VA COMO TEXTO, Y NO ES UN DETALLE ────────────────────────────────
 *
 * 6.238 de los 48.127 códigos son NEGATIVOS —bonificados y ajustes—. Excel lee
 * `-304229` como un número y lo escribe como número; si alguna planilla del
 * camino le aplica un formato, o SIFACO espera texto, el signo o los ceros a la
 * izquierda se pierden y el código deja de cruzar.
 *
 * `json_to_sheet` tipa las celdas sola: un número entra como número. Por eso
 * acá se reescriben a mano las columnas declaradas como texto.
 *
 * ── LAS OFERTAS SON IGUALES EN LAS CUATRO SUCURSALES ────────────────────────
 *
 * Lo confirmó Facundo. No hay columna de sucursal en ninguno de los tres
 * archivos, y eso es una decisión declarada y no un olvido: el día que una
 * sucursal tenga su propia oferta, este exportador no sirve como está.
 */

/** Las columnas que van como texto aunque parezcan números. */
const COMO_TEXTO = new Set(['SKU', 'CODIGO', 'BARRAS', 'BARRAS_2'])

function hoja(filas: Record<string, unknown>[]): XLSX.WorkSheet {
  const ws = XLSX.utils.json_to_sheet(filas)
  const rango = XLSX.utils.decode_range(ws['!ref'] ?? 'A1')
  const cols = filas.length ? Object.keys(filas[0]) : []

  for (let c = rango.s.c; c <= rango.e.c; c++) {
    if (!COMO_TEXTO.has(cols[c])) continue
    for (let f = rango.s.r + 1; f <= rango.e.r; f++) {
      const dir = XLSX.utils.encode_cell({ r: f, c })
      const celda = ws[dir]
      if (!celda || celda.v === null || celda.v === undefined) continue
      // `t: 's'` y `z: '@'`: el primero es el tipo, el segundo el formato de
      // celda. Sin el formato, Excel lo vuelve a interpretar al abrirlo.
      ws[dir] = { t: 's', v: String(celda.v), z: '@' }
    }
  }

  ws['!cols'] = cols.map((col) => {
    const max = Math.max(col.length, ...filas.map((f) => String(f[col] ?? '').length))
    return { wch: Math.min(Math.max(max + 2, 8), 50) }
  })
  return ws
}

function bajar(nombre: string, filas: Record<string, unknown>[], sheet: string) {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, hoja(filas), sheet)
  XLSX.writeFile(wb, nombre.endsWith('.xlsx') ? nombre : `${nombre}.xlsx`)
}

export interface ProductoParaSifaco {
  sku: string
  barras?: string | null
  nombre?: string | null
  precio?: number | null
  costo?: number | null
  descuento_pct?: number | null
  precio_con_descuento?: number | null
  motivo?: string | null
}

const hoy = () => new Date().toISOString().slice(0, 10)

/**
 * B.2.a · PRECIOS ACTUALIZADOS.
 *
 * Sólo los que tienen precio. Un renglón con precio vacío importado en SIFACO
 * es un precio en cero, y un precio en cero es regalar el producto.
 */
export function exportarPreciosParaSifaco(filas: ProductoParaSifaco[]) {
  const limpias = filas.filter((f) => f.precio != null && Number(f.precio) > 0)
  bajar(`sifaco-precios-${hoy()}`, limpias.map((f) => ({
    SKU: f.sku,
    BARRAS: f.barras ?? '',
    DESCRIPCION: f.nombre ?? '',
    PRECIO: Number(f.precio),
  })), 'Precios')
  return { exportados: limpias.length, sinPrecio: filas.length - limpias.length }
}

/**
 * B.2.b · OFERTAS CON SU PORCENTAJE.
 *
 * El porcentaje Y el precio final, los dos. SIFACO acepta cualquiera de los
 * dos y cuál usa lo decide quien importa; mandar uno solo obliga a recalcular
 * del otro lado, y un redondeo distinto allá cambia el precio de góndola.
 */
export function exportarOfertasParaSifaco(filas: ProductoParaSifaco[]) {
  const limpias = filas.filter(
    (f) => f.descuento_pct != null && Number(f.descuento_pct) > 0 && f.precio != null,
  )
  bajar(`sifaco-ofertas-${hoy()}`, limpias.map((f) => ({
    SKU: f.sku,
    BARRAS: f.barras ?? '',
    DESCRIPCION: f.nombre ?? '',
    PRECIO: Number(f.precio),
    DESCUENTO_PCT: Number(f.descuento_pct),
    PRECIO_OFERTA: f.precio_con_descuento != null
      ? Number(f.precio_con_descuento)
      : Math.round(Number(f.precio) * (1 - Number(f.descuento_pct) / 100) * 100) / 100,
  })), 'Ofertas')
  return { exportados: limpias.length, sinDescuento: filas.length - limpias.length }
}

/**
 * B.2.c · BAJAS.
 *
 * Con el motivo. Una baja sin motivo del otro lado es una fila que alguien va a
 * tener que venir a preguntar, y la respuesta ya la sabíamos acá.
 */
export function exportarBajasParaSifaco(filas: ProductoParaSifaco[]) {
  bajar(`sifaco-bajas-${hoy()}`, filas.map((f) => ({
    SKU: f.sku,
    BARRAS: f.barras ?? '',
    DESCRIPCION: f.nombre ?? '',
    MOTIVO: f.motivo ?? 'sin motivo declarado',
  })), 'Bajas')
  return { exportados: filas.length }
}
