/**
 * ¿EL DIFERENCIADOR DESCRIBE TODO LO QUE SE PUEDE PROPONER?
 *
 * Uso: npx tsx scripts/fabrica-probar-diff.ts
 *
 * ── POR QUÉ ESTA PRUEBA ─────────────────────────────────────────────────────
 *
 * El hallazgo 16 fue un aspecto que la fábrica gobernaba y el diff no mostraba:
 * una propuesta de parámetro llegaba a la cola diciendo "No cambia nada". Un
 * aspecto sin línea de diff es ese hallazgo otra vez, así que se prueban TODOS.
 *
 * No usa la cola: llama a `diffLegible` directo, con dos manifiestos en memoria.
 * Así no deja propuestas de prueba en producción, y no hay nada que limpiar
 * después — el hallazgo 15 dice que una sonda no debería dejar rastro.
 */
import { diffLegible, DIFERENCIADOR_VERSION } from '../lib/fabrica/escritor'
import { MANIFIESTOS } from '../lib/fabrica/manifiestos'
import { versionActual } from '../lib/fabrica/versiones'
import type { Manifiesto } from '../lib/fabrica/tipos'

let fallo = false
function aspecto(nombre: string, lineas: { texto: string; costo: string }[]) {
  const ok = lineas.length > 0
  if (!ok) fallo = true
  console.log(`\n${ok ? '✓' : '✗'} ${nombre}`)
  for (const l of lineas) {
    console.log(`    ${l.texto}`)
    console.log(`    costo: ${l.costo}`)
  }
  if (!ok) console.log('    (el diff no dice NADA sobre este cambio — es el hallazgo 16 otra vez)')
}

const CTX = { gobernando: true, personasConAcceso: 4 }
const copia = (m: Manifiesto): Manifiesto => JSON.parse(JSON.stringify(m))

async function main() {
  console.log(`Diferenciador versión ${DIFERENCIADOR_VERSION}\n`)
  const stock = (await versionActual('stock'))!.manifiesto
  const documentos = (await versionActual('documentos'))!.manifiesto

  // La dimensión no vive en stock ni en documentos: se busca en los diez en vez
  // de dejar el aspecto sin probar. Un aspecto sin probar es un aspecto que
  // puede no tener línea de diff, que es el hallazgo 16.
  const todos: Manifiesto[] = []
  for (const clave of Object.keys(MANIFIESTOS)) {
    const v = await versionActual(clave)
    if (v) todos.push(v.manifiesto)
  }

  /* ── presentación ─────────────────────────────────────────────────── */
  {
    const p = copia(stock)
    p.pantallas[1] = { ...p.pantallas[1], titulo: 'Otro nombre' }
    aspecto('TÍTULO DE PANTALLA', diffLegible(stock, p, CTX))
  }

  /* ── navegación ───────────────────────────────────────────────────── */
  {
    const p = copia(stock)
    p.pantallas[1] = { ...p.pantallas[1], navegable: false }
    aspecto('NAVEGACIÓN (sacar del menú)', diffLegible(stock, p, CTX))
  }

  /* ── parámetros ───────────────────────────────────────────────────── */
  {
    const p = copia(stock)
    p.configurable = (p.configurable ?? []).map((c) =>
      c.clave === 'dias_aviso_vencimiento' ? { ...c, default: 7 } : c,
    )
    aspecto('PARÁMETRO', diffLegible(stock, p, CTX))
  }

  /* ── dimensiones ──────────────────────────────────────────────────── */
  {
    const conDim = todos.find((m) => (m.dimensiones ?? []).some((d) => d.valores.length > 1))
    if (!conDim) {
      console.log('\n✗ DIMENSIONES: ningún pool declara una con más de un valor. Sin probar.')
      fallo = true
    } else {
      const p = copia(conDim)
      p.dimensiones = (p.dimensiones ?? []).map((d, i) =>
        i === 0 ? { ...d, valores: d.valores.slice(0, -1) } : d,
      )
      aspecto(`DIMENSIÓN (sacar un valor · ${conDim.pool})`, diffLegible(conDim, p, CTX))
    }
  }

  /* ── agentes ──────────────────────────────────────────────────────── */
  {
    const p = copia(documentos)
    p.agentes = (p.agentes ?? []).map((a, i) =>
      i === 0
        ? { ...a, acciones: a.acciones.map((c, j) => (j === 0 ? { ...c, participacion: 'nunca' } : c)) }
        : a,
    )
    aspecto('AGENTE (autonomía de una acción)', diffLegible(documentos, p, CTX))
  }

  /* ── identidad del pool ───────────────────────────────────────────── */
  {
    const p = copia(stock)
    p.nombre = 'Operaciones de depósito'
    aspecto('NOMBRE DEL POOL', diffLegible(stock, p, CTX))
  }

  /* ── la contraprueba: sin cambios, el diff tiene que estar VACÍO ──── */
  const sinCambios = diffLegible(stock, copia(stock), CTX)
  console.log(
    `\n${sinCambios.length === 0 ? '✓' : '✗'} CONTRAPRUEBA · sin cambios el diff está vacío (${sinCambios.length} línea(s))`,
  )
  console.log('    Si diera líneas, todo lo de arriba sería ruido y no detección.')
  if (sinCambios.length !== 0) fallo = true

  console.log('')
  process.exit(fallo ? 1 : 0)
}

main()
