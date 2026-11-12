/**
 * Texto de una factura de droguería con texto extraíble (Asoprofarma, Monroe).
 * Las fotos no pasan por acá: van al motor de documentos, pendientes de OCR.
 *
 * Los números de los tests son inventados. La forma de la línea es la real.
 */

export type LineaFactura = {
  codigo: string | null
  descripcion: string
  cantidad: number | null
  precioUnitario: number | null
  importe: number | null
}

export type FacturaTexto = {
  proveedor: string | null
  tipo: string | null
  numero: string | null
  fecha: string | null
  total: number | null
  sucursal: 'GUZ' | 'FIG' | null
  lineas: LineaFactura[]
}

function numAr(s: string): number | null {
  const t = s.trim().replace(/\s/g, '')
  if (!t) return null
  const n = Number(t.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}

function fechaIso(d: string, m: string, a: string): string {
  const anio = a.length === 2 ? `20${a}` : a
  return `${anio}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}

export function parsearFacturaTexto(texto: string, origenNombre = ''): FacturaTexto {
  const plano = texto.replace(/\u0000/g, ' ')
  const compacto = plano.replace(/[ \t]+/g, ' ')
  const n = `${compacto}\n${origenNombre}`.toLowerCase()

  let proveedor: string | null = null
  if (/monroe/.test(n)) proveedor = 'Monroe Americana'
  else if (/asoprofarma|asopro/.test(n)) proveedor = 'Asoprofarma'

  const tipo = /factura\s*\n?\s*a\b/i.test(plano) || /\bfactura a\b/i.test(compacto) ? 'Factura A' : null

  const numero =
    compacto.match(/\b(\d{4}-\d{8})\b/)?.[1]
    ?? compacto.match(/\b(\d{4}-\d{7,9})\b/)?.[1]
    ?? null

  const fechas = [...compacto.matchAll(/\b(\d{2})\/(\d{2})\/(\d{4})\b/g)].map((m) => fechaIso(m[1], m[2], m[3]))
  const fecha = fechas[0] ?? null

  const totalLabel = compacto.match(/total general\s+([\d.]+,\d{2})/i)?.[1]
  const total = totalLabel ? numAr(totalLabel) : null

  const sucursal = /figueiras/.test(n) ? 'FIG' as const : /guz/.test(n) ? 'GUZ' as const : null

  const lineas: LineaFactura[] = []
  for (const cruda of plano.split(/\r?\n/)) {
    const linea = cruda.replace(/[ \t]+/g, ' ').trim()
    if (!/^\d{8,14}\b/.test(linea)) continue
    if (/total|subtotal|cuit/i.test(linea)) continue
    const codigo = linea.match(/^(\d{8,14})/)?.[1] ?? null
    const rest = linea.slice(codigo?.length ?? 0).trim()

    if (proveedor === 'Monroe Americana') {
      // código, descripción, cantidad, precio público, margen, oferta, unitario, importe
      const nums = [...rest.matchAll(/(\d{1,3}(?:\.\d{3})*,\d{2}|\d+)/g)]
      if (nums.length < 3) continue
      const importe = numAr(nums[nums.length - 1][1])
      const unitario = numAr(nums[nums.length - 2][1])
      const cantidad = Number(nums[0][1].replace(/\./g, ''))
      const desc = rest.slice(0, nums[0].index).trim()
      if (!desc) continue
      lineas.push({
        codigo,
        descripcion: desc,
        cantidad: Number.isFinite(cantidad) ? cantidad : null,
        precioUnitario: unitario,
        importe,
      })
      continue
    }

    // Asoprofarma: código, cantidad, descripción, precios con punto decimal.
    const cantM = rest.match(/^(\d{1,4})\s+/)
    const cantidad = cantM ? Number(cantM[1]) : null
    const despues = cantM ? rest.slice(cantM[0].length) : rest
    const precios = [...despues.matchAll(/(\d+\.\d{2})/g)]
    if (!precios.length) continue
    const desc = despues.slice(0, precios[0].index).replace(/\s{2,}/g, ' ').trim()
    if (!desc || desc.length < 3) continue
    const unitario = Number(precios[0][1])
    const importe = Number(precios[precios.length - 1][1])
    lineas.push({
      codigo,
      descripcion: desc.replace(/\s+(MED|PSI)\s*$/i, '').trim(),
      cantidad,
      precioUnitario: Number.isFinite(unitario) ? unitario : null,
      importe: Number.isFinite(importe) ? importe : null,
    })
  }

  const totalFinal = total ?? (lineas.length
    ? Math.round(lineas.reduce((a, l) => a + (l.importe ?? 0), 0) * 100) / 100
    : null)

  return { proveedor, tipo, numero, fecha, total: totalFinal, sucursal, lineas }
}
