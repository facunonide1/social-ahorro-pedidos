/**
 * ¿LAS AUTOMATIZACIONES DECLARADAS EXISTEN, Y HACEN LO QUE DICEN?
 *
 * Uso: npx tsx scripts/fabrica-relevar-automatizaciones.ts
 *
 * ── QUÉ ES UNA AUTOMATIZACIÓN Y QUÉ NO ──────────────────────────────────────
 *
 * Corre SOLA. Un cron, un trigger, un evento. Si alguien tiene que apretar algo
 * para que pase, es una acción y no una automatización — y el manifiesto las
 * declara todas juntas en `agentes[].acciones[]`, así que hay que separarlas
 * acá. Es la pregunta 6 aplicada al aspecto nuevo: ¿la categoría existe?
 *
 * ── QUÉ SE PUEDE VERIFICAR, Y QUÉ NO ────────────────────────────────────────
 *
 * SE PUEDE: que el cron esté agendado en vercel.json, que su ruta exista, y qué
 * módulos importa.
 *
 * NO SE PUEDE, y es la pregunta 7 aplicada a esta verificación: que la
 * automatización CORRA. Que el archivo exista no dice que Vercel la haya
 * disparado, ni que haya terminado, ni que haya hecho lo que dice. Verificar el
 * archivo y llamarlo "verificada" sería medir algo cierto al lado de lo que
 * hace falta.
 *
 * Lo más cerca que se llega sin datos de ejecución es: agendada + ruta
 * existente + módulos coherentes con lo declarado. Se dice así, no "verificada".
 *
 * OBSERVA Y NO AFIRMA: lee archivos y no escribe en ninguna parte.
 */
import { existsSync, readFileSync } from 'node:fs'

import { MANIFIESTOS } from '../lib/fabrica/manifiestos'

interface Cron {
  path: string
  schedule: string
}

function cronsAgendados(): Cron[] {
  const j = JSON.parse(readFileSync('vercel.json', 'utf8')) as { crons?: Cron[] }
  return j.crons ?? []
}

/**
 * Qué automatización REAL corresponde a cada acción declarada.
 *
 * Escrito leyendo las rutas, una por una — no de memoria: van cinco casos de
 * dependencias mal escritas que estuvieron verdes por escribirlas de memoria.
 * Una acción que no está acá es, o una acción de usuario, o una automatización
 * que nadie mapeó todavía; el script distingue las dos con `esAutomatizacion`.
 */
const MAPA: Record<string, { ruta: string; nota?: string }> = {
  'inteligencia.armar_resumen_diario': { ruta: '/api/ai/resumen-diario' },
  'inteligencia.auditar_acciones': { ruta: '/api/cron/nora-auditor' },
  'tareas.generar_agenda_dia': { ruta: '/api/cron/generar-agenda' },
  'tareas.generar_recurrencias': { ruta: '/api/cron/recurrencias' },
  'tareas.marcar_vencidas': { ruta: '/api/cron/marcar-vencidas' },
  'tareas.escalar_trabadas': { ruta: '/api/cron/escalamiento' },
  'tareas.evaluar_triggers': { ruta: '/api/cron/check-triggers' },
  'stock.recalcular_alertas': { ruta: '/api/cron/alertas-stock' },
  'stock.recalcular_rotacion': { ruta: '/api/cron/metricas-stock' },
  'stock.avisar_vencimientos': {
    ruta: '/api/cron/alertas-stock',
    nota: 'No tiene cron propio: el aviso de vencimientos sale del mismo cron de alertas de stock.',
  },
  'clientes.correr_automatizaciones': { ruta: '/api/cron/correr-automatizaciones' },
}

/** Las que corren solas. El resto son acciones que alguien dispara. */
const ES_AUTOMATIZACION = new Set(Object.keys(MAPA))

function rutaDeArchivo(ruta: string): string {
  return `app${ruta}/route.ts`
}

function main() {
  const crons = cronsAgendados()
  const agendadas = new Set(crons.map((c) => c.path))

  let declaradas = 0
  let acciones = 0
  const conRuta: string[] = []
  const sinAgendar: string[] = []
  const sinRuta: string[] = []
  const conBrecha: { clave: string; nivel: string; brecha: string; tercero: boolean }[] = []

  console.log('\n═══ AUTOMATIZACIONES DECLARADAS ═══\n')

  for (const e of Object.values(MANIFIESTOS)) {
    const m = e.manifiesto
    for (const a of m.agentes ?? []) {
      for (const c of a.acciones ?? []) {
        const clave = `${m.pool}.${c.clave}`
        if (!ES_AUTOMATIZACION.has(clave)) {
          acciones++
          continue
        }
        declaradas++
        const mapa = MAPA[clave]
        const archivo = rutaDeArchivo(mapa.ruta)
        const existe = existsSync(archivo)
        const agendada = agendadas.has(mapa.ruta)

        const estado = !existe
          ? '✗ LA RUTA NO EXISTE'
          : !agendada
            ? '⚠ EXISTE PERO NO ESTÁ AGENDADA: no corre sola'
            : '· agendada y con ruta'
        if (!existe) sinRuta.push(clave)
        else if (!agendada) sinAgendar.push(clave)
        else conRuta.push(clave)

        const marcas =
          (c.compromete_tercero ? 'TERCERO ' : '') +
          (c.toca_dinero ? 'DINERO ' : '') +
          (c.reversible === false ? 'IRREVERSIBLE' : '')
        console.log(`${clave}`)
        console.log(`  ${mapa.ruta}  ${estado}`)
        console.log(
          `  nivel declarado: ${c.participacion}${marcas ? ` · ${marcas}` : ''}` +
            (agendada ? ` · ${crons.find((x) => x.path === mapa.ruta)?.schedule}` : ''),
        )
        if (mapa.nota) console.log(`  ${mapa.nota}`)
        if (c.brecha) {
          conBrecha.push({
            clave,
            nivel: c.participacion,
            brecha: c.brecha,
            tercero: c.compromete_tercero === true,
          })
          console.log(`  BRECHA: ${c.brecha}`)
        }
        console.log('')
      }
    }
  }

  /* ── Crons que corren y ningún pool declara ─────────────────────────── */
  const mapeadas = new Set(Object.values(MAPA).map((x) => x.ruta))
  const huerfanos = crons.filter((c) => !mapeadas.has(c.path))

  console.log('═══ CRONS QUE CORREN Y NADIE DECLARA ═══\n')
  for (const c of huerfanos) {
    const archivo = rutaDeArchivo(c.path)
    console.log(`  ${c.path.padEnd(42)} ${c.schedule.padEnd(14)} ${existsSync(archivo) ? '' : '✗ sin ruta'}`)
  }

  console.log('\n═══ EL RECUENTO ═══')
  console.log(`  acciones declaradas que NO son automatizaciones: ${acciones}`)
  console.log(`  automatizaciones declaradas: ${declaradas}`)
  console.log(`    agendadas y con ruta:   ${conRuta.length}`)
  console.log(`    con ruta y SIN agendar: ${sinAgendar.length}${sinAgendar.length ? ` — ${sinAgendar.join(', ')}` : ''}`)
  console.log(`    sin ruta:               ${sinRuta.length}${sinRuta.length ? ` — ${sinRuta.join(', ')}` : ''}`)
  console.log(`    con brecha declarada:   ${conBrecha.length}`)
  console.log(`  crons que corren y nadie declara: ${huerfanos.length}`)
  console.log(
    '\nNINGUNA SE DECLARA "VERIFICADA". Que el archivo exista y el cron esté\n' +
      'agendado no dice que haya corrido, ni que haya terminado, ni que haya hecho\n' +
      'lo declarado. Eso hace falta datos de ejecución, y hoy no los hay.\n',
  )
}

main()
