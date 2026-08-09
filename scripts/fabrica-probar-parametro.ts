/**
 * LOS SEIS PASOS DEL PRIMER PARÁMETRO GOBERNADO, en producción.
 *
 * Uso: npx tsx scripts/fabrica-probar-parametro.ts
 *
 * ── QUÉ TIENE QUE PROBAR, Y QUÉ NO ALCANZA ──────────────────────────────────
 *
 * No alcanza con que el número se lea distinto. Un título mal leído se ve feo;
 * un parámetro mal leído hace que el sistema se comporte distinto sin que nadie
 * lo note. Así que se mide el COMPORTAMIENTO: cuántos vencimientos entran en la
 * ventana de aviso, calculado con la misma función que usa la pantalla.
 *
 * Deja el parámetro como estaba. Sale 1 si algún paso falla.
 */
import { aplicar, listarPropuestas, proponer, revertirPropuesta } from '../lib/fabrica/propuestas'
import { createAdminClient } from '../lib/supabase/server'
import { getVencimientos, resumenVencimientos } from '../lib/operaciones/vencimientos'
import { historialDeCampo, procedenciaDe } from '../lib/fabrica/procedencia'
import { parametro } from '../lib/os/definicion'
import { parametroGobernante } from '../lib/fabrica/lector'
import { PROYECTO_SOCIAL_AHORRO } from '../lib/fabrica/flag'

const POOL = 'stock'
const CLAVE = 'dias_aviso_vencimiento'
const CAMPO = `configurable.${CLAVE}`
const EN_CODIGO = 30
const NUEVO = 7
const AUTOR = '5bf8468f-c6a2-4231-8bcb-3c943777bf03'

let fallo = false
function paso(n: number, ok: boolean, texto: string) {
  if (!ok) fallo = true
  console.log(`\n${ok ? '✓' : '✗'} PASO ${n} · ${texto}`)
}

/**
 * Filas de referencia para medir el comportamiento.
 *
 * ── POR QUÉ NO SON LAS DE PRODUCCIÓN ────────────────────────────────────────
 *
 * Producción tiene 26 vencimientos vigentes y los 26 son `es_demo`. La pantalla
 * los excluye, así que hoy muestra 0 con cualquier ventana. Ese 0 es verdadero,
 * y medir el efecto contra él sería medir nada y decir que se probó — el cero
 * mentiroso otra vez, esta vez fabricado por la prueba.
 *
 * Así que el COMPORTAMIENTO se mide con filas de referencia y la MISMA función
 * que usa la pantalla, mientras el VALOR sale del lector real. Lo que queda
 * probado es que el parámetro gobierna el comportamiento; lo que NO queda
 * probado —y hay que decirlo— es que hoy algún número de la pantalla cambie,
 * porque hoy no hay datos reales que clasificar.
 *
 * La frontera manda: la fábrica LEE Social Ahorro, nunca escribe. Cargar
 * vencimientos de prueba para que el número se mueva sería escribir.
 */
const DIAS = [3, 12, 25, 45, 90]
function filasDeReferencia() {
  return DIAS.map((d) => ({
    dias_restantes: d,
    valor_riesgo: 1000,
    accion: 'ninguna',
    monto: 0,
    ventana_estado: 'abierta',
  })) as unknown as Parameters<typeof resumenVencimientos>[0]
}

/**
 * El COMPORTAMIENTO, no el número: cuántas filas entran en la ventana, con la
 * misma función que usa la pantalla y con el valor que gobierna de verdad.
 */
async function comportamiento(): Promise<{
  dias: number
  urgentes: number
  total: number
  enProduccion: number
}> {
  const adm = createAdminClient()
  const dias = await parametro(POOL, CLAVE, EN_CODIGO)
  const referencia = resumenVencimientos(filasDeReferencia(), dias)
  // Y de paso, lo que la pantalla mostraría hoy de verdad.
  const reales = await getVencimientos(adm, { sucursalId: null, esTodas: true })
  return {
    dias,
    urgentes: referencia.urgentes,
    total: referencia.total,
    enProduccion: resumenVencimientos(reales, dias).urgentes,
  }
}

async function main() {
  const antes = await listarPropuestas(PROYECTO_SOCIAL_AHORRO, { conAdmin: true })

  /* ── 1 · qué valor gobierna, y de dónde viene ─────────────────────── */
  const g = await parametroGobernante(POOL, CLAVE)
  const proc = await procedenciaDe(POOL, PROYECTO_SOCIAL_AHORRO)
  const pr = proc.get(CAMPO)
  const inicial = await comportamiento()
  paso(
    1,
    !!g && g.gobernado && inicial.dias === g.valor,
    `gobierna ${JSON.stringify(g?.valor)} (peso ${g?.peso}, ${g?.gobernado ? 'leído por el lector' : 'NO leído'}) · procedencia: ${pr ? pr.motivo.slice(0, 60) : 'no registrada'}`,
  )
  console.log(
    `    comportamiento con ${inicial.dias} días: ${inicial.urgentes} de ${inicial.total} fila(s) de referencia en la ventana`,
  )
  console.log(
    `    en producción hoy: ${inicial.enProduccion} vencimiento(s) reales en la ventana (los 26 vigentes son es_demo y la pantalla los excluye)`,
  )

  /* ── 2 · cambiarlo por el Taller, con firma ───────────────────────── */
  const r2 = await proponer({
    proyectoId: PROYECTO_SOCIAL_AHORRO,
    clave: POOL,
    cambio: { configurable: { [CLAVE]: NUEVO } },
    porque: `Prueba de v0.68: bajar la ventana de aviso de ${EN_CODIGO} a ${NUEVO} días para verificar que el comportamiento cambia, no sólo el número.`,
    autorId: AUTOR,
  })
  const p = r2.propuesta
  paso(
    2,
    r2.ok && p?.carril === 'amarillo',
    `propuesta en carril ${p?.carril} — ${p?.carrilMotivo?.slice(0, 90)}`,
  )
  const aplicada = p ? await aplicar({ propuestaId: p.id, autorId: AUTOR }) : { ok: false }
  console.log(`    aplicada con firma: ${aplicada.ok ? 'sí' : 'NO'}`)

  /* ── 3 · el COMPORTAMIENTO cambió ─────────────────────────────────── */
  const conNuevo = await comportamiento()
  paso(
    3,
    conNuevo.dias === NUEVO && conNuevo.urgentes !== inicial.urgentes,
    `con ${conNuevo.dias} días: ${conNuevo.urgentes} de ${conNuevo.total} en la ventana (antes ${inicial.urgentes})`,
  )
  console.log(
    `    el número cambió de ${inicial.dias} a ${conNuevo.dias} Y la clasificación de ${inicial.urgentes} a ${conNuevo.urgentes} fila(s)`,
  )
  console.log(
    `    las filas de referencia están a ${DIAS.join(', ')} días: con ventana ${inicial.dias} entran ${inicial.urgentes}, con ${conNuevo.dias} entran ${conNuevo.urgentes}`,
  )

  /* ── 4 · revertirlo ───────────────────────────────────────────────── */
  const r4 = p
    ? await revertirPropuesta({
        propuestaId: p.id,
        autorId: AUTOR,
        nota: 'Fin de la prueba de v0.68: vuelve a la ventana anterior.',
      })
    : { ok: false, error: 'no hubo propuesta' }
  paso(4, r4.ok, `revertida${r4.ok ? '' : ` · ${r4.error}`}`)

  /* ── 5 · el comportamiento volvió ─────────────────────────────────── */
  const final = await comportamiento()
  paso(
    5,
    final.dias === inicial.dias && final.urgentes === inicial.urgentes,
    `con ${final.dias} días: ${final.urgentes} de ${final.total} en la ventana — igual que al empezar`,
  )

  /* ── 6 · las tres versiones en el historial, con procedencia ──────── */
  const hist = await historialDeCampo(POOL, CAMPO, PROYECTO_SOCIAL_AHORRO)
  const conReversion = hist.filter((h) => h.esReversion).length
  paso(
    6,
    hist.length >= 2 && conReversion >= 1,
    `${hist.length} decisión(es) registradas, ${conReversion} reversión(es)`,
  )
  for (const h of hist.slice(0, 4)) {
    console.log(
      `    ${h.decididoAt.slice(0, 16).replace('T', ' ')} ${h.esReversion ? '[revert]' : '        '} ${JSON.stringify(h.valorAnterior)} → ${JSON.stringify(h.valorNuevo)} · ${h.motivo.slice(0, 62)}`,
    )
  }

  const nuevas = (await listarPropuestas(PROYECTO_SOCIAL_AHORRO, { conAdmin: true })).filter(
    (x) => !antes.some((a) => a.id === x.id),
  )
  console.log(`\npropuestas creadas por la prueba: ${nuevas.length} (quedan en el historial del Taller)`)
  console.log('')
  process.exit(fallo ? 1 : 0)
}

main()
