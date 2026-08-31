/**
 * Busca consultas que puedan estar cortando en 1000 filas sin avisar.
 *
 * PostgREST devuelve como maximo 1000 filas por respuesta. `.limit(N)` con N
 * mayor NO lo cambia: devuelve 1000 y no avisa. Una consulta sin paginar sobre
 * una tabla grande no falla — miente.
 */
import { readFileSync } from 'fs'
import { execSync } from 'child_process'

const GRANDES = [
  'productos_catalogo', 'producto_ventas_mensuales', 'producto_codigos_barras',
  'proveedor_producto', 'producto_stock_sifaco', 'sifaco_maestro_staging',
  'producto_promedios_sifaco', 'anomalias', 'ventas_diarias', 'stock_items',
  'movimientos_stock', 'stock_sucursal', 'lotes_productos', 'oferta_items',
  'listas_precios_items', 'doc_lineas', 'cnt_renglones', 'offers_gestion',
]

const archivos = execSync(
  `grep -rl "\\.from('" app lib components --include="*.ts" --include="*.tsx"`,
).toString().trim().split('\n')

const hallazgos = []

for (const f of archivos) {
  const src = readFileSync(f, 'utf8')
  const lineas = src.split('\n')
  lineas.forEach((linea, i) => {
    const m = linea.match(/\.from\('([a-z_]+)'\)/)
    if (!m || !GRANDES.includes(m[1])) return
    // La consulta puede seguir en las lineas siguientes.
    const bloque = lineas.slice(i, i + 8).join(' ')
    const cortaAqui = bloque.slice(0, bloque.search(/\n|;\s*$/) >= 0 ? undefined : undefined)
    const esConteo = /count:\s*'exact'/.test(bloque)
    const tieneRange = /\.range\(/.test(bloque)
    const limitM = bloque.match(/\.limit\((\d+)\)/)
    const limite = limitM ? Number(limitM[1]) : null
    // `head: true` con count exacto cuenta en la base: es correcto.
    const cuentaEnBase = esConteo && /head:\s*true/.test(bloque)
    // `maybeSingle`/`single` traen una fila.
    const unaFila = /\.(maybeSingle|single)\(/.test(bloque)
    // Filtro por id/sku puntual: no puede devolver miles.
    const puntual = /\.eq\('(id|sku|producto_id|oferta_id|importacion_id|codigo)'/.test(bloque)

    if (cuentaEnBase || unaFila) return

    let riesgo = null
    if (limite === null && !tieneRange) riesgo = 'sin limite ni range: techo silencioso de 1000'
    else if (limite !== null && limite > 1000) riesgo = `limit(${limite}) NO sube el techo: devuelve 1000`
    else if (limite === 1000) riesgo = 'limit(1000): justo en el techo, no se distingue de un corte'

    if (riesgo && !puntual) {
      hallazgos.push({ archivo: f, linea: i + 1, tabla: m[1], riesgo, esConteo })
    }
  })
}

hallazgos.sort((a, b) => (a.archivo + a.linea).localeCompare(b.archivo + b.linea))
console.log(`consultas en riesgo: ${hallazgos.length}\n`)
for (const h of hallazgos) {
  console.log(`  ${h.archivo}:${h.linea}`)
  console.log(`     ${h.tabla.padEnd(26)} ${h.riesgo}${h.esConteo ? '  ← ES UN CONTEO' : ''}`)
}
