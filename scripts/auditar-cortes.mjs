/**
 * EL AUDITOR DE CORTES SILENCIOSOS.
 *
 * ── QUÉ BUSCA ───────────────────────────────────────────────────────────────
 *
 * PostgREST devuelve como máximo 1000 filas por respuesta. `.limit(5000)` NO
 * cambia eso: devuelve 1000 y **no avisa**. No hay error, no hay warning. La
 * consulta parece haber salido bien y el resultado está cortado.
 *
 * Ese error mintió cuatro veces en este proyecto antes de que existiera esto:
 * la carga de proveedores («4.836 productos no cruzan», falso), la pantalla del
 * maestro («2 meses de ventas» sobre 598.117 filas), la de controlados (1.000
 * de 3.649) y la de stock («1000 de 1000» con 46.009 cargados).
 *
 * ── LOS TRES PATRONES ───────────────────────────────────────────────────────
 *
 *   1. Sin `limit` ni `range`          → techo silencioso de 1000
 *   2. `limit(N)` con N > 1000         → no sube el techo; devuelve 1000
 *   3. `limit(1000)` justo en el borde → un corte no se distingue de un
 *                                        resultado completo
 *
 * ── LO QUE NO ES UN HALLAZGO ────────────────────────────────────────────────
 *
 *   · `count: 'exact', head: true`  → cuenta EN LA BASE, no trae filas
 *   · `.single()` / `.maybeSingle()` → una fila por definición
 *   · un filtro por clave única      → no puede devolver miles
 *   · `paginar()` / `traerTodo()`    → ya está resuelto
 *
 * Corre con `npm run auditar:cortes`. Sale con código 1 si aparece una consulta
 * nueva, para que se note en el build.
 */
import { readFileSync, existsSync } from 'fs'
import { execSync } from 'child_process'

/**
 * Cuántas filas tiene cada tabla y cada vista, CONTADO EN LA BASE.
 *
 * ── POR QUÉ ESTO YA NO ES UNA LISTA ESCRITA A MANO ──────────────────────────
 *
 * Lo era, con los conteos del 31 de agosto. `transferir_antes_de_comprar` es
 * una vista creada en la v0.96 con 2.909 filas: no estaba en la lista, así que
 * este auditor la ignoró y el corte silencioso de la v0.98 pasó entero —
 * Abasto mostró 635 productos donde hay 1.687.
 *
 * Al generarlo aparecieron **25 relaciones más** que podían cortar y que el
 * auditor no miraba, incluidas `stock_disponible` (48.217),
 * `stock_disponible_sucursal` (192.868) y `reco_compras` (48.206).
 *
 * Se regenera con `npm run contar:relaciones` y se versiona, para que el build
 * no dependa de poder consultar la base.
 */
const CONTEO = 'scripts/conteo-relaciones.json'
const conteo = existsSync(CONTEO)
  ? JSON.parse(readFileSync(CONTEO, 'utf8'))
  : { relaciones: {}, desconocidas: [], contado_at: null }

export const TABLAS_GRANDES = conteo.relaciones

/**
 * Cuánto puede devolver una relación, para decidir si hay que mirarla.
 *
 * ── FALLA POR OMISIÓN ───────────────────────────────────────────────────────
 *
 * Una relación que NO está en el conteo devuelve Infinity: se trata como
 * grande y la consulta se marca. Antes, lo que no estaba en la lista pasaba —
 * y es exactamente así como se coló el corte.
 *
 * Una relación que está pero no se pudo contar (-1) también: no saber cuántas
 * filas tiene no es saber que tiene pocas.
 */
function filasDe(tabla) {
  // La fábrica es otro producto, con su propia frontera (docs/fabrica/FRONTERA.md).
  // No está en el conteo porque no se cuenta, no porque se haya olvidado: eso
  // es una exclusión declarada y no una omisión.
  if (tabla.startsWith('fab_')) return 0
  const n = TABLAS_GRANDES[tabla]
  if (n === undefined) return Infinity
  if (n < 0) return Infinity
  return n
}

/** Archivos que son la solución, no el problema. */
const EXENTOS = [
  'lib/supabase/paginar.ts',
  'lib/catalogo/indice.ts',   // es el que pagina; marcarlo era marcar la cura
  'scripts/auditar-cortes.mjs',
]

const ARCHIVO_ACEPTADAS = 'scripts/cortes-aceptados.json'

/**
 * Junta la consulta entera aunque esté partida en varias líneas o armada por
 * pedazos sobre una variable (`let q = sb.from(...)` y después `q = q.eq(...)`).
 */
function bloqueDeConsulta(lineas, i) {
  const linea = lineas[i]
  let bloque = linea
  // Sigue mientras la línea siguiente encadene o siga abierta.
  for (let k = i + 1; k < Math.min(i + 14, lineas.length); k++) {
    const s = lineas[k]
    if (/^\s*\.(select|eq|neq|in|is|gt|gte|lt|lte|like|ilike|or|not|order|limit|range|filter|single|maybeSingle|csv|throwOnError|insert|upsert|update|delete)\b/.test(s)
      || /^\s*\)/.test(s) || /,\s*$/.test(lineas[k - 1])) {
      bloque += '\n' + s
    } else break
  }
  // Reasignaciones sobre la misma variable: `q = q.eq(...)`
  const varM = linea.match(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/)
  if (varM) {
    const v = varM[1]
    const re = new RegExp(`\\b${v}\\s*=\\s*${v}\\b|\\b${v}\\.(range|limit|order)\\(`)
    for (let k = i + 1; k < lineas.length; k++) {
      if (re.test(lineas[k])) bloque += '\n' + lineas[k]
      if (/^\s*(export\s+)?(async\s+)?function\b/.test(lineas[k])) break
    }
  }
  return bloque
}

export function auditar() {
  const archivos = execSync(
    `grep -rl "\\.from('" app lib components scripts --include="*.ts" --include="*.tsx" --include="*.mjs" 2>/dev/null || true`,
  ).toString().trim().split('\n').filter(Boolean)

  const hallazgos = []

  for (const f of archivos) {
    if (EXENTOS.some((e) => f.endsWith(e))) continue
    const lineas = readFileSync(f, 'utf8').split('\n')

    lineas.forEach((linea, i) => {
      // Un ejemplo dentro de un comentario no es una consulta. Ya marco
      // lib/sucursal/server.ts, donde el `.from()` esta en el JSDoc.
      if (/^\s*(\/\/|\*|\/\*)/.test(linea)) return
      const m = linea.match(/\.from\('([a-z_]+)'\)/)
      if (!m) return
      const tabla = m[1]
      // Antes: `if (!(tabla in TABLAS_GRANDES)) return` — lo que no estaba en
      // la lista pasaba. Ahora lo que no se conoce se mira igual.
      if (filasDe(tabla) <= 1000) return

      // Tambien hacia atras: en `paginar(sb.from(...).select(...).order(...))`
      // la envoltura esta ANTES del .from, y mirando solo hacia adelante la
      // consulta ya arreglada se seguia marcando.
      const antes = lineas.slice(Math.max(0, i - 4), i).join('\n')
      const bloque = antes + '\n' + bloqueDeConsulta(lineas, i)

      // No es un hallazgo.
      // Una ESCRITURA no puede truncarse: insert, upsert, update y delete no
      // devuelven un conjunto que PostgREST corte. Marcarlas era ruido, y un
      // auditor que grita de mas se deja de mirar.
      if (/\.(insert|upsert|update|delete)\(/.test(bloque)) return
      if (/count:\s*'exact'[^}]*head:\s*true|head:\s*true[^}]*count:\s*'exact'/s.test(bloque)) return
      if (/\.(maybeSingle|single)\(/.test(bloque)) return
      if (/\.range\(/.test(bloque)) return
      if (/paginar\s*[<(]|traerTodo\s*[<(]/.test(bloque)) return
      // Filtro por una clave que devuelve pocas filas.
      if (/\.eq\('(id|sku|codigo|codigo_barras|archivo_hash)'/.test(bloque)) return

      const limitM = bloque.match(/\.limit\((\d+)\)/)
      const limite = limitM ? Number(limitM[1]) : null

      let patron = null
      if (limite === null) patron = 'sin-limite'
      else if (limite > 1000) patron = `limit-inutil(${limite})`
      else if (limite === 1000) patron = 'limit-en-el-borde'

      if (!patron) return

      // `.in('col', lista)` esta acotado por quien llama. Sigue siendo un riesgo
      // —si la lista pasa de mil, la respuesta se corta— pero es otra clase: se
      // arregla en trozos, no paginando.
      const acotadoPorLista = /\.in\('/.test(bloque)

      hallazgos.push({
        archivo: f,
        linea: i + 1,
        clase: acotadoPorLista ? 'acotado-por-lista' : 'barrido',
        tabla,
        filas: TABLAS_GRANDES[tabla] ?? null,
        // `null` = no se sabe cuántas filas tiene. No es cero y no es «pocas»:
        // es una relación que el conteo no conoce o no pudo contar, y por eso
        // se mira igual.
        miente_hoy: filasDe(tabla) > 1000,
        patron,
        // `.length` sobre el resultado es un conteo en memoria: lo peor.
        cuenta_en_memoria: /\.length\b/.test(lineas.slice(i, i + 20).join('\n')),
      })
    })
  }

  return hallazgos
}

function clave(h) {
  return `${h.archivo}:${h.tabla}:${h.patron}`
}

const hallazgos = auditar()

// Las que ya se miraron y se decidió dejar así, con motivo escrito.
const aceptadas = existsSync(ARCHIVO_ACEPTADAS)
  ? JSON.parse(readFileSync(ARCHIVO_ACEPTADAS, 'utf8'))
  : {}

const nuevas = hallazgos.filter((h) => !(clave(h) in aceptadas))
const mientenHoy = hallazgos.filter((h) => h.miente_hoy)

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(hallazgos, null, 1))
} else {
  console.log(`consultas en riesgo: ${hallazgos.length}`)
  console.log(`  mienten hoy (tabla con mas de 1000 filas): ${mientenHoy.length}`)
  console.log(`  van a mentir (tabla chica todavia):        ${hallazgos.length - mientenHoy.length}`)
  console.log(`  sin aceptar explicitamente:                ${nuevas.length}\n`)
  for (const h of hallazgos.sort((a, b) => Number(b.miente_hoy) - Number(a.miente_hoy) || a.archivo.localeCompare(b.archivo))) {
    const mark = h.miente_hoy ? '!' : ' '
    const cnt = h.cuenta_en_memoria ? ' [cuenta en memoria]' : ''
    console.log(`${mark} ${h.archivo}:${h.linea}  ${h.tabla} (${h.filas})  ${h.patron}${cnt}`)
  }
}

if (nuevas.length > 0 && !process.argv.includes('--json')) {
  console.log(`\nHAY ${nuevas.length} SIN ACEPTAR. Arreglalas, o anotalas en ${ARCHIVO_ACEPTADAS} con el motivo.`)
  process.exit(1)
}
