/**
 * DÓNDE SE USA CADA PARÁMETRO, detectado contra el código.
 *
 * Uso: npx tsx scripts/fabrica-detectar-dependencias.ts [--json]
 *
 * ── POR QUÉ NO SE ESCRIBE DE MEMORIA ────────────────────────────────────────
 *
 * Escribir de memoria dónde se usa algo es el mismo error que escribir de
 * memoria un nombre de columna, que ya falló cuatro veces en este proyecto. La
 * diferencia es que un nombre de columna equivocado revienta y se ve; una
 * dependencia inventada se queda ahí, silenciosa, y hace que la verificación de
 * cableado dé verde sobre un archivo que no existe.
 *
 * ── CÓMO DETECTA ───────────────────────────────────────────────────────────
 *
 * Dos señales, y las dos se reportan por separado porque significan cosas
 * distintas:
 *
 *   CABLEADO   una llamada a `parametro('<pool>', '<clave>', X)`. El valor sale
 *              de la fábrica. Se lee la clave del argumento, no de una lista.
 *   CANDIDATO  el concepto aparece en el código con un literal, sin pasar por
 *              la fábrica. Es el cableado a medias, o el que falta.
 *
 * Para lo segundo hace falta saber QUÉ buscar, y eso no se puede derivar de la
 * clave sola: `dias_aviso_vencimiento` no aparece como texto en el código, lo
 * que aparece es un `30` al lado de la palabra "vencimiento". Así que las
 * pistas se declaran acá, en una tabla, y se dice que son pistas.
 *
 * ── LO QUE ESTE SCRIPT NO PUEDE ────────────────────────────────────────────
 *
 * No entiende el código: hace texto. Un literal en una variable intermedia, o
 * un valor que llega por props desde tres niveles arriba, se le escapa. Por eso
 * lo que produce es una PROPUESTA que una persona confirma, y por eso el
 * resultado se escribe en el manifiesto a mano y no automáticamente.
 *
 * NO ESCRIBE NADA. Ni en el manifiesto, ni en la base, ni en el log de la
 * fábrica: es el hallazgo 15 aplicado antes de repetirlo. Una sonda que escribe
 * lo que mide fabrica los datos que después alguien lee.
 */
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

import { MANIFIESTOS } from '../lib/fabrica/manifiestos'

/**
 * Pistas para encontrar un parámetro que TODAVÍA no pasa por la fábrica.
 *
 * ── SÓLO IDENTIFICADORES EXACTOS ────────────────────────────────────────────
 *
 * La primera versión usaba expresiones difusas —"riesgo" cerca de un número— y
 * produjo 15 falsos positivos para UN parámetro: filtros de UI, KPIs de RRHH,
 * un endpoint de demo. Volcar eso al manifiesto habría sido escribir ficción en
 * el contrato, que es peor que dejarlo vacío: la verificación de cableado daría
 * verde sobre archivos que no tienen nada que ver.
 *
 * Así que sólo van identificadores exactos, verificados uno por uno leyendo la
 * línea. Lo que no se puede identificar así se reporta como NO DETERMINABLE, y
 * eso es una respuesta.
 */
const PISTAS: Record<string, RegExp[]> = {
  // Verificados: el default del manifiesto coincide con el de la constante.
  'documentos.umbral_confianza_auto': [/\bDOC_UMBRAL_AUTO\b/],
  'documentos.usos_minimos_alias': [/\bDOC_USOS_MIN_AUTO\b/],
  'compras.alerta_suba_pct': [/\bDOC_ALERTA_SUBA_PCT\b/],
  'stock.dias_aviso_vencimiento': [/\benDiasISO\(\s*30\s*\)/],
}

/**
 * Parámetros con más de un candidato en el código y ninguna forma de decidir
 * cuál es sin preguntarle a quien lo escribió.
 *
 * Se declara la ambigüedad en vez de elegir. Elegir sería adivinar, y una
 * dependencia adivinada es indistinguible de una correcta hasta que alguien
 * cambia el valor y no pasa nada.
 */
const AMBIGUOS: Record<string, string> = {
  'compras.dias_ventana_costo':
    'Hay dos constantes con el mismo valor 60 y conceptos parecidos: DOC_DIAS_DATO_FRESCO (hasta cuándo un precio se considera fresco) y DOC_CONC_VENTANA_DIAS (ventana de conciliación). El manifiesto dice "días para comparar la evolución de un costo", que se parece más a la primera. No se elige desde acá.',
  'centro-datos.umbral_match_automatico':
    'lib/centro-datos/deteccion.ts tiene una tabla de umbrales por tipo de columna (0.95, 0.97, 0.8, 0.7, 0.65) y ningún umbral único. El parámetro declara UNO solo: o el manifiesto simplifica de más, o el código tiene que consolidar. Es una pregunta de diseño, no de detección.',
}

/** Los archivos de Social Ahorro. La fábrica se mira aparte y no cuenta. */
function archivosDelSector(): string[] {
  return execSync(
    "git ls-files 'app/**/*.tsx' 'app/**/*.ts' 'lib/**/*.ts' 'lib/**/*.tsx' 'components/**/*.tsx'",
    { encoding: 'utf8' },
  )
    .split('\n')
    .filter(Boolean)
    .filter((f) => !f.startsWith('lib/fabrica/') && !f.startsWith('app/fabrica/') && !f.startsWith('components/fabrica/'))
}

export interface Hallazgo {
  clave: string
  archivo: string
  linea: number
  cableado: boolean
  texto: string
}

export function detectar(): Hallazgo[] {
  const out: Hallazgo[] = []
  const archivos = archivosDelSector()

  // Las llamadas reales. La clave sale del ARGUMENTO, no de una lista nuestra:
  // así una llamada a un parámetro que nadie declaró también aparece.
  const llamada = /parametro(?:<[^>]*>)?\(\s*'([^']+)'\s*,\s*'([^']+)'/g

  for (const archivo of archivos) {
    const texto = readFileSync(archivo, 'utf8')
    const lineas = texto.split('\n')

    for (const m of texto.matchAll(llamada)) {
      const linea = texto.slice(0, m.index).split('\n').length
      out.push({
        clave: `${m[1]}.${m[2]}`,
        archivo,
        linea,
        cableado: true,
        texto: lineas[linea - 1]?.trim().slice(0, 120) ?? '',
      })
    }

    for (const [clave, pistas] of Object.entries(PISTAS)) {
      lineas.forEach((l, i) => {
        if (!pistas.some((re) => re.test(l))) return
        // Si esa misma línea ya es una llamada a la fábrica, no es un candidato.
        if (/parametro(?:<[^>]*>)?\(/.test(l)) return
        out.push({ clave, archivo, linea: i + 1, cableado: false, texto: l.trim().slice(0, 120) })
      })
    }
  }
  return out
}

function main() {
  const hallazgos = detectar()
  const claves = new Set<string>()
  for (const entrada of Object.values(MANIFIESTOS)) {
    for (const c of entrada.manifiesto.configurable ?? []) {
      claves.add(`${entrada.manifiesto.pool}.${c.clave}`)
    }
  }

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(hallazgos, null, 2))
    return
  }

  const porClave = new Map<string, Hallazgo[]>()
  for (const h of hallazgos) porClave.set(h.clave, [...(porClave.get(h.clave) ?? []), h])

  console.log(`\n${archivosDelSector().length} archivos de Social Ahorro recorridos.\n`)
  for (const [clave, hs] of [...porClave.entries()].sort()) {
    const cableados = hs.filter((h) => h.cableado)
    const candidatos = hs.filter((h) => !h.cableado)
    const conocida = claves.has(clave)
    console.log(
      `${clave}${conocida ? '' : '  ⚠ NO está declarado en ningún manifiesto'}\n` +
        `  ${cableados.length} llamada(s) a la fábrica · ${candidatos.length} literal(es) sin cablear`,
    )
    for (const h of cableados) console.log(`    ✓ ${h.archivo}:${h.linea}`)
    for (const h of candidatos) console.log(`    · ${h.archivo}:${h.linea}  ${h.texto}`)
    console.log('')
  }

  console.log('AMBIGUOS · más de un candidato y ninguna forma de decidir sin preguntar:')
  for (const [clave, motivo] of Object.entries(AMBIGUOS)) {
    console.log(`  ${clave}\n    ${motivo}`)
  }

  const sinRastro = [...claves].filter((c) => !porClave.has(c) && !(c in AMBIGUOS))
  console.log(`\nSIN NINGÚN RASTRO EN EL CÓDIGO: ${sinRastro.length} de ${claves.size}`)
  for (const c of sinRastro) console.log(`  ${c}`)
  console.log(
    '\nEsto es una PROPUESTA. El script hace texto, no entiende el código: un literal\n' +
      'en una variable intermedia se le escapa. Una persona confirma antes de que entre\n' +
      'al manifiesto.\n',
  )
}

main()
