/**
 * LOS SIETE PASOS DE LA PRIMERA AUTOMATIZACIÓN GOBERNADA.
 *
 * Uso: npx tsx scripts/fabrica-probar-automatizacion.ts
 *
 * ── EL PASO 4 ES EL QUE IMPORTA ─────────────────────────────────────────────
 *
 * Apagar una automatización NO es deshacer lo que hizo. Lo que ya calculó, ya
 * avisó o ya creó queda. Si el sistema dejara creer lo contrario, alguien
 * apagaría una campaña pensando que la des-envía.
 *
 * Deja la automatización como estaba. Sale 1 si algún paso falla.
 */
import { aplicar, listarPropuestas, proponer, revertirPropuesta } from '../lib/fabrica/propuestas'
import { carrilDeCampo } from '../lib/fabrica/carriles'
import { diffLegible } from '../lib/fabrica/escritor'
import { resolver } from '../lib/fabrica/overrides'
import { automatizacionActiva } from '../lib/os/definicion'
import { createAdminClient } from '../lib/supabase/server'
import { estadoDelLector, PROYECTO_SOCIAL_AHORRO } from '../lib/fabrica/flag'
import { historialDeCampo, procedenciaDe } from '../lib/fabrica/procedencia'
import { versionActual } from '../lib/fabrica/versiones'
import { abrirPrueba, cerrarPrueba } from './fabrica-marco-de-prueba'

// Antes de la primera escritura: lo que se escriba antes nace sin marca.
abrirPrueba()

const POOL = 'stock'
const CLAVE = 'recalcular_rotacion'
const CAMPO = `automatizaciones.${CLAVE}.activa`
const AUTOR = '5bf8468f-c6a2-4231-8bcb-3c943777bf03'

let fallo = false
function paso(n: number, ok: boolean, texto: string) {
  if (!ok) fallo = true
  console.log(`\n${ok ? '✓' : '✗'} PASO ${n} · ${texto}`)
}

/** Lo que la automatización dejó hecho: filas de rotación calculadas. */
async function loQueYaHizo(): Promise<{ filas: number; ultima: string | null }> {
  const adm = createAdminClient()
  const { count } = await adm
    .from('producto_rotacion')
    .select('producto_id', { count: 'exact', head: true })
  const { data } = await adm
    .from('producto_rotacion')
    .select('updated_at')
    .order('updated_at', { ascending: false })
    .limit(1)
  return {
    filas: count ?? 0,
    ultima: (data as { updated_at: string }[] | null)?.[0]?.updated_at ?? null,
  }
}

async function main() {
  const version = (await versionActual(POOL))!
  const acc = (version.manifiesto.agentes ?? [])
    .flatMap((a) => a.acciones)
    .find((c) => c.clave === CLAVE)!

  /* ── 1 · qué estado gobierna, y de dónde viene ────────────────────── */
  const activa = await automatizacionActiva(POOL, CLAVE, true)
  const estado = (await estadoDelLector(PROYECTO_SOCIAL_AHORRO, { conAdmin: true })).find(
    (e) => e.clave === POOL,
  )!
  const proc = await procedenciaDe(POOL, PROYECTO_SOCIAL_AHORRO)
  paso(
    1,
    activa === true && estado.lector === 'prendido',
    `activa=${activa} · lector ${estado.lector} · ${acc.automatizacion?.donde_corre} (${acc.automatizacion?.disparo}) · procedencia: ${proc.get(CAMPO)?.motivo.slice(0, 50) ?? 'no registrada'}`,
  )
  console.log(`    al apagarla: ${acc.automatizacion?.al_apagar}`)

  const antesDeApagar = await loQueYaHizo()
  console.log(`    lo que ya hizo: ${antesDeApagar.filas} fila(s) de rotación`)

  /* ── 2 · apagarla desde el Taller, con firma ──────────────────────── */
  const r2 = await proponer({
    proyectoId: PROYECTO_SOCIAL_AHORRO,
    clave: POOL,
    cambio: { automatizaciones: { [CLAVE]: false } },
    porque: 'Prueba de v0.74: apagar la primera automatización gobernada y verificar que apagar no es deshacer.',
    autorId: AUTOR,
  })
  const p = r2.propuesta
  paso(2, r2.ok && p?.carril === 'amarillo', `propuesta en carril ${p?.carril}`)
  for (const d of p?.queCambia ?? []) {
    console.log(`    ${d.texto}`)
    console.log(`    costo: ${d.costo}`)
  }
  const aplicada = p ? await aplicar({ propuestaId: p.id, autorId: AUTOR }) : { ok: false }
  console.log(`    aplicada con firma: ${aplicada.ok ? 'sí' : 'NO'}`)

  /* ── 3 · efectivamente NO corre ───────────────────────────────────── */
  const trasApagar = await automatizacionActiva(POOL, CLAVE, true)
  paso(3, trasApagar === false, `automatizacionActiva devuelve ${trasApagar}: el cron sale sin hacer nada`)

  /* ── 4 · LO QUE YA HABÍA HECHO SIGUE AHÍ ──────────────────────────── */
  const despues = await loQueYaHizo()
  paso(
    4,
    despues.filas === antesDeApagar.filas && despues.ultima === antesDeApagar.ultima,
    `${despues.filas} fila(s) de rotación, las mismas que antes. Apagar NO deshace.`,
  )
  console.log(`    última actualización: ${despues.ultima ?? 'ninguna'} (sin cambios)`)

  /* ── 5 · volver a prenderla ───────────────────────────────────────── */
  const r5 = p
    ? await revertirPropuesta({
        propuestaId: p.id,
        autorId: AUTOR,
        nota: 'Fin de la prueba de v0.74: vuelve a estar activa.',
      })
    : { ok: false, error: 'no hubo propuesta' }
  paso(5, r5.ok, `revertida${r5.ok ? '' : ` · ${r5.error}`}`)

  /* ── 6 · vuelve a correr ──────────────────────────────────────────── */
  const alFinal = await automatizacionActiva(POOL, CLAVE, true)
  paso(6, alFinal === true, `automatizacionActiva devuelve ${alFinal}: el cron vuelve a hacer su trabajo`)

  /* ── 7 · el historial con su procedencia ──────────────────────────── */
  const hist = await historialDeCampo(POOL, CAMPO, PROYECTO_SOCIAL_AHORRO)
  paso(
    7,
    hist.length >= 2 && hist.some((h) => h.esReversion),
    `${hist.length} decisión(es) registradas, ${hist.filter((h) => h.esReversion).length} reversión(es)`,
  )
  for (const h of hist.slice(0, 3)) {
    console.log(
      `    ${h.decididoAt.slice(0, 16).replace('T', ' ')} ${h.esReversion ? '[revert]' : '        '} ${JSON.stringify(h.valorAnterior)} → ${JSON.stringify(h.valorNuevo)}`,
    )
  }

  /* ── C.4 · LA DE PESO ALTO ────────────────────────────────────────── */
  //
  // `clientes.correr_automatizaciones` es la única cableada que compromete algo
  // con alguien de afuera: manda campañas a clientes reales. Su pool está
  // APAGADO, así que se puede verificar todo menos el efecto: con el lector
  // apagado, apagarla en el Taller no cambia lo que hace el cron. Se dice.
  const vC = (await versionActual('clientes'))!
  const accC = (vC.manifiesto.agentes ?? [])
    .flatMap((a) => a.acciones)
    .find((c) => c.clave === 'correr_automatizaciones')!

  const carril = carrilDeCampo({
    campo: 'automatizaciones.correr_automatizaciones',
    nivel: 'instalacion',
    delPool: vC.manifiesto,
    valor: false,
    // Con el interruptor ABIERTO: si igual no cae en verde, no es por el flag.
    verdeHabilitado: () => true,
  })
  paso(8, carril.carril === 'amarillo', `no cae en verde ni con el interruptor abierto: ${carril.carril}`)

  const { manifiesto: apagada } = resolver(vC.manifiesto, {
    automatizaciones: { correr_automatizaciones: false },
  })
  const diff = diffLegible(vC.manifiesto, apagada, { gobernando: false, personasConAcceso: 0 })
  const dice = diff.find((d) => d.texto.includes('deja de correr'))
  paso(
    9,
    !!dice && dice.costo.includes('APAGAR NO ES DESHACER') && dice.costo.includes('NO se pueden traer de vuelta'),
    'el costo dice qué NO se deshace',
  )
  console.log(`    ${dice?.costo}`)

  paso(
    10,
    accC.compromete_tercero === true && accC.participacion === 'prepara' && !!accC.brecha,
    `compromete_tercero=${accC.compromete_tercero} · nivel ${accC.participacion} · brecha declarada: ${accC.brecha ? 'sí' : 'NO'}`,
  )
  console.log(
    '    NO se prueba el efecto: el pool clientes está apagado, así que apagarla\n' +
      '    en el Taller no cambia lo que hace el cron. Eso necesita prender el pool.',
  )

  const nuevas = (await listarPropuestas(PROYECTO_SOCIAL_AHORRO, { conAdmin: true })).filter(
    (x) => x.campos.some((c) => c.startsWith('automatizaciones.')),
  )
  console.log(`\npropuestas de automatización en el historial: ${nuevas.length}`)
  await cerrarPrueba()
  console.log('')
  process.exit(fallo ? 1 : 0)
}

main()
