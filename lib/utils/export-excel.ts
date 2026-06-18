import * as XLSX from 'xlsx'

/**
 * Exporta filas a un .xlsx real (regla global OPS: toda pantalla de productos
 * exporta Excel con SKU). Corre en el browser (dispara la descarga).
 *
 * @example exportExcel('stock', rows, { sheet: 'Stock' })
 */
export function exportExcel(
  nombre: string,
  filas: Record<string, unknown>[],
  opts: { sheet?: string } = {},
) {
  const ws = XLSX.utils.json_to_sheet(filas)
  // Auto-ancho básico por columna (es-AR friendly)
  const cols = filas.length > 0 ? Object.keys(filas[0]) : []
  ws['!cols'] = cols.map((c) => {
    const max = Math.max(c.length, ...filas.map((f) => String(f[c] ?? '').length))
    return { wch: Math.min(Math.max(max + 2, 8), 50) }
  })
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, opts.sheet ?? 'Hoja1')
  const file = nombre.endsWith('.xlsx') ? nombre : `${nombre}.xlsx`
  XLSX.writeFile(wb, file)
}

/** Parsea un File (xlsx/csv) a matriz de filas (array de arrays). Browser. */
export async function parseSpreadsheet(file: File): Promise<{ headers: string[]; rows: string[][] }> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const matrix = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: '' })
  const nonEmpty = matrix.filter((r) => r.some((c) => String(c).trim() !== ''))
  const headers = (nonEmpty.shift() ?? []).map((h) => String(h).trim())
  return { headers, rows: nonEmpty.map((r) => r.map((c) => String(c ?? '').trim())) }
}
