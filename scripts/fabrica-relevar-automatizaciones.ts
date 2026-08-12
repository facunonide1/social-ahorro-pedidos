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
 * acá. Es la pregunta 6 aplicada al aspecto: ¿la categoría existe?
 *
 * ── DE DÓNDE SALE LA RUTA (v0.75) ───────────────────────────────────────────
 *
 * Del contrato: `automatizacion.donde_corre`. Hasta v0.74 este script tenía su
 * propio MAPA de clave → ruta, escrito a mano al lado del contrato que ya decía
 * lo mismo. Dos listas que hay que mover juntas son un error esperando, y en
 * v0.74 ese error apareció dos veces por su cuenta. Se borró el MAPA.
 *
 * Y tener una sola lista habilita una verificación que antes era imposible:
 * comparar `agendada` —lo que el contrato DICE— contra vercel.json —lo que
 * PASA—. Con dos listas, el script sólo podía contradecirse a sí mismo.
 *
 * ── QUÉ SE PUEDE VERIFICAR, Y QUÉ NO ────────────────────────────────────────
 *
 * SE PUEDE: que el cron esté agendado en vercel.json, que su ruta exista, y que
 * lo declarado en `agendada` coincida con eso.
 *
 * NO SE PUEDE, y es la pregunta 7 aplicada a esta verificación: que la
 * automatización CORRA. Que el archivo exista no dice que Vercel la haya
 * disparado, ni que haya terminado, ni que haya hecho lo que dice. Verificar el
 * archivo y llamarlo "verificada" sería medir algo cierto al lado de lo que
 * hace falta.
 *
 * Lo más cerca que se llega sin datos de ejecución es: agendada + ruta
 * existente. Se dice así, no "verificada".
 *
 * OBSERVA Y NO AFIRMA: lee archivos y no escribe en ninguna parte.
 */
import { existsSync, readFileSync } from 'node:fs'

import { CABLEADAS } from '../lib/fabrica/estado'
import { MANIFIESTOS } from '../lib/fabrica/manifiestos'
import type { ContratoDeAutomatizacion } from '../lib/fabrica/tipos'

interface Cron {
  path: string
  schedule: string
}

function cronsAgendados(): Cron[] {
  const j = JSON.parse(readFileSync('vercel.json', 'utf8')) as { crons?: Cron[] }
  return j.crons ?? []
}

function rutaDeArchivo(ruta: string): string {
  return `app${ruta}/route.ts`
}

/**
 * Lo que corre sin estar declarado en ningún pool, y por qué no se declara.
 *
 * Un cron acá no es un olvido: es software cuyo sector no existe todavía en la
 * fábrica. Declararlo en el pool que más se le parezca sería forzarlo, y el
 * manifiesto quedaría diciendo que un pool se hace cargo de tablas que no son
 * suyas. Se deja afuera con el motivo escrito.
 */
const SIN_POOL: Record<string, string> = {
  '/api/cron/calcular-objetivos':
    'Recalcula los objetivos de cada empleado (empleados_objetivos). El sector personas no está declarado: ninguna de sus tablas tiene dueño.',
  '/api/cron/comunicacion-recordatorios':
    'Postea recordatorios en los canales internos (recordatorios_programados, mensajes). El sector comunicacion no está declarado.',
  '/api/cron/comunicacion-resumen':
    'Resume los chats del día y calcula el clima por punto (clima_chats). El sector comunicacion no está declarado.',
}

function main() {
  const crons = cronsAgendados()
  const agendadas = new Set(crons.map((c) => c.path))

  let declaradas = 0
  let acciones = 0
  const conRuta: string[] = []
  const sinAgendar: string[] = []
  const sinRuta: string[] = []
  const conBrecha: string[] = []
  /** El código pregunta y la lista no lo sabe, o al revés. */
  const cableadoDesincronizado: string[] = []
  /** El contrato dice una cosa de `agendada` y vercel.json dice otra. */
  const desincronizadas: string[] = []
  const rutasDeclaradas = new Set<string>()

  console.log('\n═══ AUTOMATIZACIONES DECLARADAS ═══\n')

  for (const e of Object.values(MANIFIESTOS)) {
    const m = e.manifiesto
    for (const a of m.agentes ?? []) {
      for (const c of a.acciones ?? []) {
        const auto = c.automatizacion as ContratoDeAutomatizacion | undefined
        if (!auto) {
          acciones++
          continue
        }
        declaradas++
        const clave = `${m.pool}.${c.clave}`
        const archivo = rutaDeArchivo(auto.donde_corre)
        const existe = existsSync(archivo)
        const agendada = agendadas.has(auto.donde_corre)
        rutasDeclaradas.add(auto.donde_corre)

        const estado = !existe
          ? '✗ LA RUTA NO EXISTE'
          : !agendada
            ? '⚠ EXISTE PERO NO ESTÁ AGENDADA: no corre sola'
            : '· agendada y con ruta'
        if (!existe) sinRuta.push(clave)
        else if (!agendada) sinAgendar.push(clave)
        else conRuta.push(clave)

        // Lo declarado contra lo que pasa. Sólo es posible porque la ruta sale
        // del mismo contrato que el `agendada`.
        if (auto.agendada !== undefined && auto.agendada !== agendada) {
          desincronizadas.push(
            `${clave}: declara agendada=${auto.agendada} y vercel.json dice ${agendada}`,
          )
        }

        const marcas =
          (c.compromete_tercero ? 'TERCERO ' : '') +
          (c.toca_dinero ? 'DINERO ' : '') +
          (c.reversible === false ? 'IRREVERSIBLE' : '')
        console.log(`${clave}`)
        console.log(`  ${auto.donde_corre}  ${estado}`)
        console.log(
          `  nivel declarado: ${c.participacion}${marcas ? ` · ${marcas}` : ''}` +
            (agendada ? ` · ${crons.find((x) => x.path === auto.donde_corre)?.schedule}` : ''),
        )
        if (auto.tambien_manual) console.log(`  TAMBIÉN A MANO: ${auto.tambien_manual}`)

        // Las dos listas: la que cuenta el estado y lo que hace el código.
        // Se compara buscando la llamada exacta, con el pool y la clave, no
        // sólo el nombre de la función: un archivo que le pregunta a la fábrica
        // por OTRA automatización daría verde sobre lo que no miró.
        const llamada = `automatizacionActiva('${m.pool}', '${c.clave}'`
        const preguntaEnElCodigo = existe && readFileSync(archivo, 'utf8').includes(llamada)
        const enLaLista = CABLEADAS.has(clave)
        if (preguntaEnElCodigo !== enLaLista) {
          cableadoDesincronizado.push(
            `${clave}: el código ${preguntaEnElCodigo ? 'SÍ' : 'NO'} pregunta y la lista dice que ${enLaLista ? 'sí' : 'no'}`,
          )
        }
        console.log(`  cableada: ${preguntaEnElCodigo ? 'sí' : 'NO — se apaga en el Taller y corre igual'}`)
        if (c.brecha) {
          conBrecha.push(clave)
          console.log(`  BRECHA: ${c.brecha}`)
        }
        console.log('')
      }
    }
  }

  /* ── Crons que corren y ningún pool declara ─────────────────────────── */
  const huerfanos = crons.filter((c) => !rutasDeclaradas.has(c.path))

  console.log('═══ CRONS QUE CORREN Y NADIE DECLARA ═══\n')
  if (huerfanos.length === 0) console.log('  ninguno\n')
  for (const c of huerfanos) {
    const motivo = SIN_POOL[c.path]
    console.log(`  ${c.path.padEnd(40)} ${c.schedule.padEnd(13)} ${existsSync(rutaDeArchivo(c.path)) ? '' : '✗ sin ruta'}`)
    console.log(`    ${motivo ?? '⚠ SIN MOTIVO ESCRITO: o se declara, o se dice por qué no.'}`)
  }

  console.log('\n═══ EL RECUENTO ═══')
  console.log(`  acciones declaradas que NO son automatizaciones: ${acciones}`)
  console.log(`  automatizaciones declaradas: ${declaradas}`)
  console.log(`    agendadas y con ruta:   ${conRuta.length}`)
  console.log(`    con ruta y SIN agendar: ${sinAgendar.length}${sinAgendar.length ? ` — ${sinAgendar.join(', ')}` : ''}`)
  console.log(`    sin ruta:               ${sinRuta.length}${sinRuta.length ? ` — ${sinRuta.join(', ')}` : ''}`)
  console.log(`    con brecha declarada:   ${conBrecha.length}${conBrecha.length ? ` — ${conBrecha.join(', ')}` : ''}`)
  console.log(`  cableadas de verdad: ${[...CABLEADAS].length} en la lista del estado`)
  console.log(`  cableado desincronizado con el código: ${cableadoDesincronizado.length}`)
  for (const d of cableadoDesincronizado) console.log(`    ✗ ${d}`)
  console.log(`  contrato desincronizado con vercel.json: ${desincronizadas.length}`)
  for (const d of desincronizadas) console.log(`    ✗ ${d}`)
  console.log(`  crons que corren y nadie declara: ${huerfanos.length}`)
  console.log(`    con motivo escrito: ${huerfanos.filter((c) => SIN_POOL[c.path]).length}`)
  console.log(
    '\nNINGUNA SE DECLARA "VERIFICADA". Que el archivo exista y el cron esté\n' +
      'agendado no dice que haya corrido, ni que haya terminado, ni que haya hecho\n' +
      'lo declarado. Eso necesita datos de ejecución, y hoy no los hay.\n',
  )
}

main()
