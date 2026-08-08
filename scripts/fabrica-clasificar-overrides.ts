/**
 * ¿CUÁLES DE LOS OVERRIDES DE TÍTULO SON VOCABULARIO Y CUÁLES SON DEUDA?
 *
 * Uso: npx tsx scripts/fabrica-clasificar-overrides.ts
 *
 * Hasta 1.4.0 `titulos` servía para dos cosas distintas y no había forma de
 * distinguirlas. Este script las separa con una prueba concreta, no con
 * intuición:
 *
 *   ¿El override coincide con el literal que tiene el código de la pantalla?
 *     SÍ  → la pieza está mal escrita. El código es la única implementación que
 *           existe; si la pieza no coincide con ella, el que está mal es la
 *           pieza. El override es DEUDA: tapa el defecto y el próximo negocio
 *           que instale la pieza se lo come.
 *     NO  → nadie más lo dice así. Es VOCABULARIO de este negocio, y con 1.5.0
 *           va en `vocabulario`, que no borra el término del oficio.
 *
 *   Y un tercer caso que no estaba previsto: el override IDÉNTICO a la pieza.
 *   No cambia nada y hace que el origen mienta —el portal dice "decisión de
 *   este negocio" sobre algo que nadie decidió—.
 *
 * ── DE DÓNDE SALE EL LITERAL DEL CÓDIGO ─────────────────────────────────────
 *
 * NO del comparador: el comparador cruza rutas contra el registry de navegación
 * y no conoce el literal de la cabecera. Es la limitación que quedó probada en
 * v0.66 cuando la verificación provocada dio cero y prender el pool cambió dos
 * pantallas.
 *
 * El literal existe en UN solo lugar: el tercer argumento de
 * `tituloDePantalla(pool, ruta, 'Literal')` en cada pantalla cableada. Es el
 * fallback, o sea exactamente lo que se ve si la fábrica no contesta. Se lee de
 * ahí, del archivo, y no se adivina.
 */
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

import { estadoDelLector, PROYECTO_SOCIAL_AHORRO } from '../lib/fabrica/flag'
import { overridesActuales } from '../lib/fabrica/overrides'
import { versionActual } from '../lib/fabrica/versiones'

type Tipo = 'deuda' | 'vocabulario' | 'ruido' | 'indecidible'

const EXPLICA: Record<Tipo, string> = {
  deuda: 'la pieza está mal escrita: coincide con el código, no con la pieza',
  vocabulario: 'vocabulario de este negocio: no coincide ni con la pieza ni con el código',
  ruido: 'idéntico a la pieza: no cambia nada y hace que el origen mienta',
  indecidible: 'no se pudo leer el literal del código: no se clasifica',
}

/**
 * pool → ruta → literal que muestra el código.
 *
 * Si un archivo tiene la llamada partida en varias líneas, el regex no la
 * agarra y esa ruta queda INDECIDIBLE. No se completa con lo que "debería ser":
 * un clasificador que rellena huecos clasifica su propia suposición.
 */
function literalesDelCodigo(): Map<string, string> {
  const salida = new Map<string, string>()
  const archivos = execSync('grep -rl "tituloDePantalla(" app --include="*.tsx"', {
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean)

  const re = /tituloDePantalla\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'((?:[^'\\]|\\.)*)'\s*\)/g
  for (const f of archivos) {
    const texto = readFileSync(f, 'utf8')
    for (const m of texto.matchAll(re)) {
      salida.set(`${m[1]}|${m[2]}`, m[3].replace(/\\'/g, "'"))
    }
  }
  return salida
}

async function main() {
  const literales = literalesDelCodigo()
  console.log(`Literales leídos del código: ${literales.size}`)

  const estados = await estadoDelLector(PROYECTO_SOCIAL_AHORRO, { conAdmin: true })
  const cuenta: Record<Tipo, number> = { deuda: 0, vocabulario: 0, ruido: 0, indecidible: 0 }
  const detalle: { pool: string; ruta: string; tipo: Tipo; pieza: string; ahora: string; codigo: string | null }[] = []

  for (const e of estados) {
    const propios = await overridesActuales(e.instalacionId)
    const titulos = propios?.overrides.titulos ?? {}
    if (Object.keys(titulos).length === 0) continue

    const version = await versionActual(e.clave)
    if (!version) continue

    for (const [ruta, ahora] of Object.entries(titulos)) {
      const pieza = version.manifiesto.pantallas.find((p) => p.ruta === ruta)?.titulo ?? '?'
      const codigo = literales.get(`${e.clave}|${ruta}`) ?? null
      const tipo: Tipo =
        ahora === pieza ? 'ruido' : codigo === null ? 'indecidible' : ahora === codigo ? 'deuda' : 'vocabulario'
      cuenta[tipo]++
      detalle.push({ pool: e.clave, ruta, tipo, pieza, ahora, codigo })
    }
  }

  for (const tipo of ['ruido', 'deuda', 'vocabulario', 'indecidible'] as Tipo[]) {
    const los = detalle.filter((d) => d.tipo === tipo)
    if (los.length === 0) continue
    console.log(`\n■ ${tipo.toUpperCase()} · ${los.length} — ${EXPLICA[tipo]}`)
    for (const d of los) {
      console.log(
        `   ${d.pool.padEnd(11)} ${d.ruta.padEnd(44)} pieza ${JSON.stringify(d.pieza).padEnd(30)} override ${JSON.stringify(d.ahora).padEnd(34)} código ${JSON.stringify(d.codigo)}`,
      )
    }
  }

  console.log(
    `\nTOTAL ${detalle.length} · ruido ${cuenta.ruido} · deuda ${cuenta.deuda} · vocabulario ${cuenta.vocabulario} · indecidible ${cuenta.indecidible}\n`,
  )
}

main()
