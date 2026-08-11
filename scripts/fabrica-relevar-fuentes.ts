/**
 * ¿ALGÚN PARÁMETRO TIENE MÁS DE UNA FUENTE?
 *
 * Uso: npx tsx scripts/fabrica-relevar-fuentes.ts
 *
 * ── POR QUÉ IMPORTA ─────────────────────────────────────────────────────────
 *
 * Un parámetro con dos fuentes y ninguna regla de precedencia es un conflicto
 * silencioso: el sistema se comporta según una y el Taller muestra la otra.
 * Nadie ve la contradicción porque cada lado es coherente consigo mismo, que es
 * exactamente el modo de falla del cableado a medias, un nivel más arriba.
 *
 * ── DOS CRITERIOS, VERIFICADOS APARTE ───────────────────────────────────────
 *
 * NOMBRE: una constante `process.env.X ?? default` cuyo nombre comparte tokens
 *   con la clave del parámetro. Es la señal fuerte. Se lista con su valor para
 *   poder comparar contra el default declarado.
 *
 * FALLBACK DUPLICADO: el mismo parámetro se pide desde N lugares, cada uno con
 *   su literal. Eso es el patrón —el literal ES el fallback— pero si los
 *   literales DIFIEREN, el sector se comporta distinto según quién pregunte
 *   cuando la fábrica no contesta. Eso sí es un conflicto.
 *
 * NO SE MATCHEA POR VALOR. `DOC_DIAS_VOLUMEN` vale 90 y `clientes.dias_riesgo_fuga`
 * también, y no tienen nada que ver. Matchear por valor daría pares inventados,
 * que es el error del detector difuso de v0.69 con otro disfraz.
 *
 * OBSERVA Y NO AFIRMA: lee archivos y no escribe en ninguna parte.
 */
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

import { ES_EXCLUIDA, resumenExclusiones } from '../lib/fabrica/exclusiones'
import { MANIFIESTOS } from '../lib/fabrica/manifiestos'

interface Constante {
  archivo: string
  nombre: string
  valor: string
}

function constantesDeEntorno(): Constante[] {
  const out: Constante[] = []
  const archivos = execSync(
    "git ls-files 'lib/**/*.ts' 'app/**/*.ts' 'app/**/*.tsx' 'components/**/*.tsx'",
    { encoding: 'utf8' },
  )
    .split('\n')
    .filter(Boolean)
    .filter((f) => !f.startsWith('lib/fabrica/') && !f.startsWith('app/fabrica/'))

  const re = /export const ([A-Z_0-9]+)\s*=\s*[^\n]*process\.env\.([A-Z_0-9]+)\s*\?\?\s*([^)\n,]+)/g
  for (const archivo of archivos) {
    for (const m of readFileSync(archivo, 'utf8').matchAll(re)) {
      out.push({ archivo, nombre: m[1], valor: m[3].trim() })
    }
  }
  return out
}

/** Tokens de una clave o de un nombre de constante, para compararlos. */
function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/^doc_/, '')
      .split(/[_\s]+/)
      .filter((t) => t.length > 2),
  )
}

/** Los literales con que cada lugar pide un parámetro. */
function fallbacks(pool: string, clave: string): { archivo: string; literal: string }[] {
  const out: { archivo: string; literal: string }[] = []
  const archivos = execSync('grep -rl "parametro" app lib --include="*.ts" --include="*.tsx"', {
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean)
    .filter((f) => !f.startsWith('lib/fabrica/'))
  const re = new RegExp(
    `parametro(?:<[^>]*>)?\\(\\s*'${pool}'\\s*,\\s*'${clave}'\\s*,\\s*([^)]+)\\)`,
    'g',
  )
  for (const archivo of archivos) {
    for (const m of readFileSync(archivo, 'utf8').matchAll(re)) {
      out.push({ archivo, literal: m[1].trim() })
    }
  }
  return out
}

function main() {
  const constantes = constantesDeEntorno()
  console.log(`\n${constantes.length} constante(s) que leen de process.env con un default.\n`)

  const conflictos: string[] = []
  const duplicados: string[] = []

  for (const entrada of Object.values(MANIFIESTOS)) {
    const pool = entrada.manifiesto.pool
    for (const p of entrada.manifiesto.configurable ?? []) {
      const tp = tokens(p.clave)

      // ── 1a · CONFIRMADO: la dependencia declarada nombra la constante ──
      //
      // Es la señal fuerte y no es heurística: alguien ya verificó, leyendo el
      // código, que ese parámetro se consume desde esa constante. Está en el
      // manifiesto desde 1.6.0.
      const declaradas = (p.depende_de ?? [])
        .map((d) => constantes.find((c) => c.nombre === d.simbolo))
        .filter(Boolean) as Constante[]

      // ── 1b · CANDIDATO: el nombre se parece. Hay que leerlo. ──────────
      const porNombre = constantes.filter((c) => {
        if (declaradas.some((d) => d.nombre === c.nombre)) return false
        const tc = tokens(c.nombre)
        let comunes = 0
        for (const t of tp) if (tc.has(t)) comunes++
        return comunes >= 2
      })

      if (declaradas.length > 0) {
        conflictos.push(`${pool}.${p.clave}`)
        console.log(`■ ${pool}.${p.clave} · declara ${JSON.stringify(p.default)}`)
        for (const c of declaradas) {
          const coincide = String(p.default) === c.valor
          console.log(
            `    CONFIRMADO  ${c.nombre} = ${c.valor}  (${c.archivo})  ${coincide ? '· mismo valor hoy' : '· ⚠ VALOR DISTINTO'}`,
          )
        }
        for (const c of porNombre) {
          console.log(`    candidato   ${c.nombre} = ${c.valor}  (${c.archivo}) · hay que leerlo`)
        }
        console.log('')
      } else if (porNombre.length > 0) {
        console.log(`■ ${pool}.${p.clave} · declara ${JSON.stringify(p.default)} · SÓLO CANDIDATOS:`)
        for (const c of porNombre) {
          console.log(`    candidato   ${c.nombre} = ${c.valor}  (${c.archivo}) · hay que leerlo`)
        }
        console.log('')
      }

      // ── 2 · fallbacks distintos en distintos lugares ───────────────
      const fb = fallbacks(pool, p.clave)
      const literales = new Set(fb.map((x) => x.literal))
      if (literales.size > 1) {
        duplicados.push(`${pool}.${p.clave}`)
        console.log(`■ ${pool}.${p.clave} · FALLBACKS DISTINTOS entre lugares:`)
        for (const x of fb) console.log(`    ${x.literal}  ${x.archivo}`)
        console.log('')
      }
    }
  }

  console.log(`CON FUENTE DE ENTORNO: ${conflictos.length} — ${conflictos.join(', ') || 'ninguno'}`)
  console.log(
    `CON FALLBACKS DISTINTOS: ${duplicados.length} — ${duplicados.join(', ') || 'ninguno'}`,
  )
  // Y las que el código consume sin que el manifiesto las conozca.
  const declaradas = new Set<string>()
  for (const entrada of Object.values(MANIFIESTOS)) {
    for (const c of entrada.manifiesto.configurable ?? []) {
      if (c.fuente?.nombre) declaradas.add(c.fuente.nombre)
      for (const d of c.depende_de ?? []) declaradas.add(d.consume)
    }
  }
  const huerfanas = constantes.filter((c) => !declaradas.has(c.nombre) && !ES_EXCLUIDA.has(c.nombre))
  console.log(`\nCONSUMIDAS Y NI DECLARADAS NI EXCLUIDAS: ${huerfanas.length}`)
  for (const c of huerfanas) console.log(`  ${c.nombre} = ${c.valor}`)
  // TRES ESTADOS, y el tercero tiene que ser cero. Si deja de serlo, se ve.
  const r = resumenExclusiones()
  console.log(
    `EXCLUIDAS CON MOTIVO: ${r.tecnicas + r.pendientes} — ${r.tecnicas} técnicas (decisión cerrada) · ` +
      `${r.pendientes} de negocio PENDIENTES de declarar (deuda, no decisión)`,
  )
  console.log(`DECLARADAS: ${declaradas.size}`)

  console.log(
    '\nEl match es por NOMBRE, nunca por valor: DOC_DIAS_VOLUMEN vale 90 y\n' +
      'clientes.dias_riesgo_fuga también, y no tienen nada que ver.\n',
  )
}

main()
