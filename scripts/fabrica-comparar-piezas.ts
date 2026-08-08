/**
 * Compara LA PIEZA contra el código, pantalla por pantalla, en sombra.
 *
 * Uso: npx tsx scripts/fabrica-comparar-piezas.ts
 *
 * ── POR QUÉ HACÍA FALTA ─────────────────────────────────────────────────────
 *
 * Hasta v0.67 la comparación en sombra usaba el título EFECTIVO —la pieza con
 * el override encima— contra el literal del código. Cuando hay un override que
 * fue escrito copiando el literal del código, eso es una tautología: compara el
 * código contra sí mismo y siempre da cero.
 *
 * Ése es el motivo real por el que stock daba 14/14 y documentos 3/3. No era
 * "la declaración coincide con el código": era "los overrides coinciden con el
 * código", que es otra cosa y no dice nada sobre la pieza.
 *
 * Desde 1.5.0 se compara contra el TÉRMINO DEL OFICIO. Este script recorre las
 * pantallas cableadas con su literal real —leído del tercer argumento de
 * `tituloDePantalla`, que es el único lugar donde vive— y deja registrado lo
 * que aparezca.
 *
 * Deja los lectores como estaban.
 */
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

import { cambiarEstadoLector, estadoDelLector, PROYECTO_SOCIAL_AHORRO } from '../lib/fabrica/flag'
import { compararEnSombra } from '../lib/fabrica/lector'

const AUTOR = '5bf8468f-c6a2-4231-8bcb-3c943777bf03'
const MOTIVO = 'Comparación de la PIEZA contra el código (v0.67). Se vuelve al estado anterior al terminar.'

function literales(): { pool: string; ruta: string; enCodigo: string }[] {
  const archivos = execSync('grep -rl "tituloDePantalla(" app --include="*.tsx"', { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
  const re = /tituloDePantalla\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'((?:[^'\\]|\\.)*)'\s*\)/g
  const out: { pool: string; ruta: string; enCodigo: string }[] = []
  for (const f of archivos) {
    for (const m of readFileSync(f, 'utf8').matchAll(re)) {
      out.push({ pool: m[1], ruta: m[2], enCodigo: m[3].replace(/\\'/g, "'") })
    }
  }
  return out
}

async function main() {
  const antes = await estadoDelLector(PROYECTO_SOCIAL_AHORRO, { conAdmin: true })
  const pantallas = literales()
  const pools = [...new Set(pantallas.map((p) => p.pool))]
  console.log(`${pantallas.length} pantallas cableadas en ${pools.length} pool(s).`)

  for (const clave of pools) {
    const estado = antes.find((e) => e.clave === clave)
    if (!estado) continue
    // Sólo tiene sentido en sombra: es el único estado en que se compara.
    const r = await cambiarEstadoLector({
      proyectoId: PROYECTO_SOCIAL_AHORRO,
      clave,
      hasta: 'sombra',
      usuarioId: AUTOR,
      motivo: MOTIVO,
    })
    if (!r.ok) {
      console.error(`  ✗ ${clave}: ${r.error}`)
      continue
    }
    for (const p of pantallas.filter((x) => x.pool === clave)) {
      await compararEnSombra(p.pool, p.ruta, p.enCodigo)
    }
    await cambiarEstadoLector({
      proyectoId: PROYECTO_SOCIAL_AHORRO,
      clave,
      hasta: estado.lector,
      usuarioId: AUTOR,
      motivo: `Fin de la comparación: vuelve a ${estado.lector}.`,
    })
    console.log(`  ✓ ${clave}: comparado y devuelto a ${estado.lector}`)
  }

  console.log('')
  for (const e of await estadoDelLector(PROYECTO_SOCIAL_AHORRO, { conAdmin: true })) {
    if (e.lector === 'apagado') continue
    console.log(`  ${e.clave.padEnd(12)} ${e.lector} · ${e.diferencias} diferencia(s) de la PIEZA contra el código`)
  }
  console.log('')
}

main()
