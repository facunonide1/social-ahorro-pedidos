/**
 * EL AUDITOR DEL LENTE DE DEMOSTRACIÓN.
 *
 * ── QUÉ BUSCA ───────────────────────────────────────────────────────────────
 *
 * El sistema tiene datos de demostración marcados con `es_demo` y un
 * interruptor —la cookie `nora_sin_demo`— para mirarlo sin ellos. El problema
 * es que el lente sólo llegaba a las pantallas que se acordaron de usarlo.
 *
 * Ya falló tres veces:
 *
 *   · v0.81 — el panel de inicio filtraba, pero `stock_items` y `arqueos_caja`
 *     alimentaban dos KPIs sin filtrar: 480 y 48 filas, todas inventadas.
 *   · v0.81 — la campana de notificaciones no filtraba nada.
 *   · v0.85 — el panel de Operaciones dice «56 quiebres» leyendo las mismas 480
 *     filas de demostración, y NORA escribe un párrafo afirmándolo.
 *
 * ── LA REGLA ────────────────────────────────────────────────────────────────
 *
 * Una pantalla que lee una tabla con `es_demo` tiene que hacer una de dos:
 *
 *   · filtrar por el lente (`sinDemo()` en servidor, `sinDemoCliente()` en
 *     cliente), o
 *   · no afirmar nada sobre esos datos.
 *
 * Lo que no se puede es mostrar un número inventado como si fuera real. Un cero
 * honesto vale más que un 56 falso.
 *
 * Corre con `npm run auditar:lente`. Sale con código 1 si aparece una pantalla
 * nueva que lee datos marcables sin el lente.
 */
import { readFileSync, existsSync } from 'fs'
import { execSync } from 'child_process'

/**
 * Las tablas que tienen `es_demo` Y que hoy contienen datos de demostración.
 * Una tabla marcable pero vacía no puede mentir todavía; se lista igual, porque
 * el día que se carguen datos de prueba sí puede.
 */
/**
 * Las tablas con `es_demo` y cuántas filas inventadas tienen HOY.
 *
 * **No se escribe a mano.** Lo estuvo, y se desincronizó: decía `tareas: 12`
 * cuando había 64 y `controles_zona: 0` cuando había 64, así que marcaba como
 * «no mienten hoy» dos pantallas que sí mentían. Lo encontró la auditoría del
 * 14 de octubre.
 *
 * Los números salen de `scripts/conteo-demo.json`, que genera
 * `npm run contar:demo` contando contra la base.
 */
function cargarConteo() {
  if (!existsSync(ARCHIVO_CONTEO)) {
    console.log(`AVISO: falta ${ARCHIVO_CONTEO}. Corré: npm run contar:demo`)
    console.log('       Sin él no se puede saber qué tablas tienen datos inventados hoy.\n')
    return { tablas: {}, medido_at: null }
  }
  return JSON.parse(readFileSync(ARCHIVO_CONTEO, 'utf8'))
}

const ARCHIVO_CONTEO = 'scripts/conteo-demo.json'
const CONTEO = cargarConteo()

// Un conteo viejo es casi tan malo como uno escrito a mano: los datos de
// demostración se cargan y se borran, y el auditor decide con esto.
if (CONTEO.medido_at) {
  const dias = Math.floor((Date.now() - Date.parse(CONTEO.medido_at)) / 86_400_000)
  if (dias > 7) {
    console.log(`AVISO: el conteo de filas de demostración tiene ${dias} días. Corré: npm run contar:demo\n`)
  }
}

export const TABLAS_MARCABLES = Object.fromEntries(
  Object.entries(CONTEO.tablas ?? {}).map(([t, v]) => [t, v.demo]),
)

const EXENTOS = [
  'scripts/auditar-lente.mjs',
  'lib/demo/estado.ts',
  'lib/demo/cliente.ts',
  'lib/demo/lente.ts',
  'lib/demo/lente-cliente.ts',
  'lib/demo/guarda-calculo.ts',
  'components/demo/aviso-demo.tsx',
  // Los importadores y los crons NO son pantallas: no afirman nada al usuario.
  // Los crons que calculan ya tienen su propia guarda (crons_calculo, v0.81).
  'app/api/',
  'scripts/',
]

const ARCHIVO_ACEPTADAS = 'scripts/lente-aceptado.json'

/** Señales de que la pantalla respeta el lente o evita afirmar. */
function respetaElLente(src) {
  // `lente(...)` y `lenteCliente(...)` son el mismo interruptor envuelto para que
  // entre donde esta la consulta (lib/demo/lente.ts, v0.92). Se agregaron porque
  // aplicarlo a mano eran tres lineas que no entraban adentro de un Promise.all,
  // y veintiocho pantallas se quedaron sin el por eso.
  return /sinDemo\(\)|sinDemoCliente\(\)|\blente\(|\blenteCliente\(|es_demo|esDemo|AvisoDemo|contarDemo/.test(src)
}

export function auditar() {
  const archivos = execSync(
    `grep -rl "\\.from('" app components --include="*.tsx" --include="*.ts" 2>/dev/null || true`,
  ).toString().trim().split('\n').filter(Boolean)

  const hallazgos = []

  for (const f of archivos) {
    if (EXENTOS.some((e) => f.startsWith(e) || f.endsWith(e))) continue
    const src = readFileSync(f, 'utf8')
    if (respetaElLente(src)) continue

    const tablas = new Set()
    for (const m of src.matchAll(/\.from\('([a-z_]+)'\)/g)) {
      if (m[1] in TABLAS_MARCABLES) tablas.add(m[1])
    }
    if (!tablas.size) continue

    const conDemo = [...tablas].filter((t) => TABLAS_MARCABLES[t] > 0)
    hallazgos.push({
      archivo: f,
      tablas: [...tablas],
      // `true` si alguna de las tablas que lee TIENE datos inventados hoy.
      afirma_sobre_demo: conDemo.length > 0,
      tablas_con_demo: conDemo,
    })
  }

  return hallazgos
}

const hallazgos = auditar()
const aceptadas = existsSync(ARCHIVO_ACEPTADAS)
  ? JSON.parse(readFileSync(ARCHIVO_ACEPTADAS, 'utf8'))
  : {}
const nuevas = hallazgos.filter((h) => !(h.archivo in aceptadas))
const mienten = hallazgos.filter((h) => h.afirma_sobre_demo)

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(hallazgos, null, 1))
} else {
  console.log(`pantallas que leen datos marcables sin el lente: ${hallazgos.length}`)
  console.log(`  afirman sobre datos que HOY son inventados:    ${mienten.length}`)
  console.log(`  sin aceptar explicitamente:                    ${nuevas.length}\n`)
  for (const h of hallazgos.sort((a, b) => Number(b.afirma_sobre_demo) - Number(a.afirma_sobre_demo) || a.archivo.localeCompare(b.archivo))) {
    console.log(`${h.afirma_sobre_demo ? '!' : ' '} ${h.archivo}`)
    console.log(`     ${h.tablas.join(', ')}`)
  }
}

if (nuevas.length > 0 && !process.argv.includes('--json')) {
  console.log(`\nHAY ${nuevas.length} SIN ACEPTAR. Ponele el lente, o anotala en ${ARCHIVO_ACEPTADAS} con el motivo.`)
  process.exit(1)
}
