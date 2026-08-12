/**
 * EL DOMINIO ENTERO, NO DE A UNA.
 *
 * Uso: npx tsx scripts/fabrica-probar-dominio.ts
 *
 * Las cuatro automatizaciones de Stock se apagan juntas, se verifica que ninguna
 * corre, que lo que ya hicieron sigue ahí, se vuelven a prender y se verifica que
 * vuelven las cuatro. Después el interruptor de pánico, y un fallback masivo.
 *
 * ── POR QUÉ DE CONJUNTO Y NO DE A UNA ───────────────────────────────────────
 *
 * Porque de a una ya se probó en v0.74 y no dice nada de lo que pasa cuando son
 * varias: si el corte deduplica mal, si las alertas se pisan, si apagar la
 * tercera revive la primera. Un dominio no es la suma de sus piezas probadas por
 * separado.
 *
 * ── EL PASO 6 ES NUEVO PARA ESTE ASPECTO ────────────────────────────────────
 *
 * El interruptor de pánico se probó con presentación: un título que vuelve al
 * del código. Nunca con algo que corre solo. Que devuelva un título es visible;
 * que devuelva una automatización al código sólo se ve si se pregunta.
 *
 * Deja todo como estaba. Sale 1 si algún paso falla.
 */
import { abrirPrueba, cerrarPrueba } from './fabrica-marco-de-prueba'

abrirPrueba()

import { aplicar, proponer, revertirPropuesta } from '../lib/fabrica/propuestas'
import { automatizacionActiva } from '../lib/os/definicion'
import { cambiarEstadoLector, estadoDelLector, panico, PROYECTO_SOCIAL_AHORRO } from '../lib/fabrica/flag'
import { createAdminClient } from '../lib/supabase/server'
import { escribirVersion } from '../lib/fabrica/escritor'
import { MANIFIESTOS } from '../lib/fabrica/manifiestos'
import { versionActual } from '../lib/fabrica/versiones'
import type { Manifiesto } from '../lib/fabrica/tipos'

const POOL = 'stock'
const AUTOR = '5bf8468f-c6a2-4231-8bcb-3c943777bf03'

let fallo = false
function paso(n: string, ok: boolean, texto: string) {
  if (!ok) fallo = true
  console.log(`\n${ok ? '✓' : '✗'} PASO ${n} · ${texto}`)
}

/** Las claves de automatización del pool, sacadas del manifiesto vigente. */
async function clavesDelPool(): Promise<{ clave: string; alApagar: string }[]> {
  const v = await versionActual(POOL)
  return (v!.manifiesto.agentes ?? [])
    .flatMap((a) => a.acciones)
    .filter((c) => c.automatizacion)
    .map((c) => ({ clave: c.clave, alApagar: c.automatizacion!.al_apagar }))
}

/** Lo que las automatizaciones de Stock dejaron hecho. */
async function loQueYaHicieron() {
  const adm = createAdminClient()
  const [rot, alertas, controles] = await Promise.all([
    adm.from('producto_rotacion').select('producto_id', { count: 'exact', head: true }),
    adm.from('alertas_stock').select('id', { count: 'exact', head: true }).eq('estado', 'activa'),
    adm.from('controles_zona').select('id', { count: 'exact', head: true }),
  ])
  return {
    rotacion: rot.count ?? 0,
    alertas: alertas.count ?? 0,
    controles: controles.count ?? 0,
  }
}

async function fallbacksRegistrados(): Promise<{ motivo: string; detalle: unknown }[]> {
  const { data } = await createAdminClient()
    .from('fab_lector_eventos')
    .select('motivo, detalle')
    .eq('proyecto_id', PROYECTO_SOCIAL_AHORRO)
    .eq('pool_clave', POOL)
    .eq('tipo', 'fallback')
    .eq('aspecto', 'automatizaciones')
    .eq('es_prueba', true)
  return (data ?? []) as { motivo: string; detalle: unknown }[]
}

/**
 * El estado de las claves QUE SE PASAN, no de las que el manifiesto diga ahora.
 *
 * Leerlas del manifiesto vigente parecía más prolijo y hacía la prueba inútil:
 * al romper el manifiesto a propósito, la lista quedaba vacía, el bucle no
 * corría, nadie le preguntaba nada a la fábrica y `Object.values({}).every(...)`
 * daba true. La aserción "las cuatro caen al código" pasaba en verde sin haber
 * mirado ninguna. Es la pregunta 2: cero porque está bien, o cero porque no miró.
 */
async function estadoDeTodas(claves: { clave: string }[]): Promise<Record<string, boolean>> {
  const out: Record<string, boolean> = {}
  for (const c of claves) out[c.clave] = await automatizacionActiva(POOL, c.clave, true)
  return out
}

async function main() {
  // Se anota QUÉ pools estaban prendidos antes de tocar nada: el pánico los
  // apaga todos y restaurar sólo Stock dejaría a Documentos apagado sin que
  // nadie lo haya decidido.
  const alEmpezar = (await estadoDelLector(PROYECTO_SOCIAL_AHORRO, { conAdmin: true }))
    .filter((e) => e.lector !== 'apagado')
    .map((e) => ({ clave: e.clave, lector: e.lector }))
  console.log(`\nPrendidos al empezar: ${alEmpezar.map((e) => `${e.clave} (${e.lector})`).join(', ')}`)

  const claves = await clavesDelPool()
  console.log(`\nEl dominio de ${POOL}: ${claves.length} automatizaciones`)
  for (const c of claves) console.log(`  · ${c.clave}`)

  const antes = await loQueYaHicieron()
  console.log(
    `\nLo que ya hicieron: ${antes.rotacion} rotación(es) · ${antes.alertas} alerta(s) activa(s) · ${antes.controles} control(es) de zona`,
  )

  /* ── 1 · APAGARLAS TODAS, DE UNA ──────────────────────────────────── */
  const cambio = { automatizaciones: Object.fromEntries(claves.map((c) => [c.clave, false])) }
  const r1 = await proponer({
    proyectoId: PROYECTO_SOCIAL_AHORRO,
    clave: POOL,
    cambio,
    porque: 'Prueba de v0.75: apagar el dominio entero de Stock en una sola decisión.',
    autorId: AUTOR,
  })
  const p = r1.propuesta
  const aplicada = p ? await aplicar({ propuestaId: p.id, autorId: AUTOR }) : { ok: false }
  paso(
    '1',
    r1.ok && p?.carril === 'amarillo' && aplicada.ok && p.campos.length === claves.length,
    `una propuesta con ${p?.campos.length ?? 0} campo(s), carril ${p?.carril}, firmada`,
  )
  for (const d of p?.queCambia ?? []) console.log(`    ${d.texto}`)

  /* ── 2 · NINGUNA CORRE ────────────────────────────────────────────── */
  const apagadas = await estadoDeTodas(claves)
  paso(
    '2',
    Object.keys(apagadas).length === claves.length && Object.values(apagadas).every((v) => v === false),
    `las ${claves.length} devuelven false: ${JSON.stringify(apagadas)}`,
  )

  /* ── 3 · LO HECHO SIGUE AHÍ ───────────────────────────────────────── */
  const durante = await loQueYaHicieron()
  paso(
    '3',
    durante.rotacion === antes.rotacion &&
      durante.alertas === antes.alertas &&
      durante.controles === antes.controles,
    `${durante.rotacion} rotación · ${durante.alertas} alertas · ${durante.controles} controles: los mismos. APAGAR NO ES DESHACER, tampoco de a cuatro.`,
  )
  for (const c of claves) console.log(`    ${c.clave}: ${c.alApagar}`)

  /* ── 4 · VOLVER A PRENDERLAS ──────────────────────────────────────── */
  const r4 = p
    ? await revertirPropuesta({
        propuestaId: p.id,
        autorId: AUTOR,
        nota: 'Fin de la prueba de v0.75: el dominio vuelve a correr.',
      })
    : { ok: false, error: 'no hubo propuesta' }
  paso('4', r4.ok, `revertida${r4.ok ? '' : ` · ${r4.error}`}`)

  /* ── 5 · VUELVEN TODAS ────────────────────────────────────────────── */
  const prendidas = await estadoDeTodas(claves)
  paso(
    '5',
    Object.keys(prendidas).length === claves.length && Object.values(prendidas).every((v) => v === true),
    `las ${claves.length} vuelven a true: ${JSON.stringify(prendidas)}`,
  )

  /* ── 6 · EL INTERRUPTOR DE PÁNICO ─────────────────────────────────── */
  //
  // Primero se apagan de nuevo, para que el pánico tenga algo que devolver: si
  // se probara con todo prendido, "todas en true" antes y después no probaría
  // nada. Es la pregunta 5: dos cosas que pueden ser la misma por construcción.
  const r6 = await proponer({
    proyectoId: PROYECTO_SOCIAL_AHORRO,
    clave: POOL,
    cambio,
    porque: 'Prueba de v0.75: dejar el dominio apagado para probar el pánico.',
    autorId: AUTOR,
  })
  if (r6.propuesta) await aplicar({ propuestaId: r6.propuesta.id, autorId: AUTOR })
  const antesDelPanico = await estadoDeTodas(claves)

  const { apagados } = await panico(PROYECTO_SOCIAL_AHORRO, AUTOR, 'Prueba de v0.75 sobre automatizaciones.')
  const trasPanico = await estadoDeTodas(claves)
  const estados = await estadoDelLector(PROYECTO_SOCIAL_AHORRO, { conAdmin: true })
  paso(
    '6',
    Object.keys(trasPanico).length === claves.length &&
      Object.values(antesDelPanico).every((v) => v === false) &&
      Object.values(trasPanico).every((v) => v === true) &&
      estados.every((e) => e.lector === 'apagado'),
    `${apagados} pool(s) apagados. Las ${claves.length} vuelven al código: ${JSON.stringify(trasPanico)}`,
  )
  console.log(
    '    Estaban en false por declaración y el pánico las devolvió a true, que es\n' +
      '    lo que hace el código. Una automatización apagada por declaración VUELVE\n' +
      '    A CORRER cuando alguien aprieta el pánico: es lo correcto —el pánico\n' +
      '    saca a la fábrica del medio— y hay que saberlo antes de apretarlo.',
  )

  /* ── 7 · FALLBACK MASIVO ──────────────────────────────────────────── */
  //
  // Un manifiesto inválido con las cuatro gobernadas. Todas tienen que caer al
  // código, tiene que quedar registrado, y las alertas no se pueden pisar entre
  // sí ni deduplicarse mal: es el hallazgo 13 en otro aspecto.
  await cambiarEstadoLector({
    proyectoId: PROYECTO_SOCIAL_AHORRO,
    clave: POOL,
    hasta: 'prendido',
    usuarioId: AUTOR,
    motivo: 'Prueba de v0.75: se prende para forzar el fallback masivo.',
  })

  const buena = (await versionActual(POOL))!

  // DOS FORMAS DE ROMPERLO, y la segunda es la que importa.
  //
  // 7a: el manifiesto no valida. El lector lo rechaza entero y registra el
  //     fallback. Es el caso que ya estaba cubierto por construcción.
  //
  // 7b: el manifiesto VALIDA y perdió las automatizaciones. El lector lo acepta,
  //     contesta "no sé nada de eso" por cada una, y las cuatro corren por el
  //     valor del código. Sin registro, ese caso es indistinguible de que todo
  //     ande bien — y es el que aparece cuando alguien renombra una clave.
  const rota = JSON.parse(JSON.stringify(buena.manifiesto)) as Manifiesto
  ;(rota as unknown as { agentes: unknown }).agentes = null

  const amputada = JSON.parse(JSON.stringify(buena.manifiesto)) as Manifiesto
  for (const ag of amputada.agentes ?? []) {
    ag.acciones = ag.acciones.map((c) => ({ ...c, automatizacion: undefined }))
  }

  const adm = createAdminClient()
  const { data: pool } = await adm.from('fab_pools').select('id').eq('clave', POOL).maybeSingle()
  // Se escribe directo y no por `escribirVersion` a propósito: el validador
  // rechazaría el manifiesto roto, que es justamente lo que hace falta meter.
  await adm.rpc('fab_escribir_version', {
    p_pool_id: (pool as { id: string }).id,
    p_manifiesto: rota as unknown as Record<string, unknown>,
    p_motivo: 'Prueba de v0.75: manifiesto roto a propósito para el fallback masivo.',
    p_autor: AUTOR,
    p_revierte_a: null,
    p_prueba: true,
  })

  const enFallback = await estadoDeTodas(claves)
  await new Promise((r) => setTimeout(r, 1500))
  const eventos7a = await fallbacksRegistrados()
  paso(
    '7a',
    Object.keys(enFallback).length === claves.length &&
      Object.values(enFallback).every((v) => v === true) &&
      eventos7a.length > 0,
    `manifiesto que NO valida: las ${claves.length} caen al código y quedan ${eventos7a.length} evento(s)`,
  )
  console.log(`    motivo: ${eventos7a[0]?.motivo?.slice(0, 110) ?? '—'}`)
  console.log(
    `    ${eventos7a.length} evento(s) para ${claves.length} consultas: el dedupe junta las de la misma\n` +
      '    causa. Un evento por consulta serían cuatro líneas iguales.',
  )

  // 7b · el que valida y perdió las automatizaciones.
  await adm.rpc('fab_escribir_version', {
    p_pool_id: (pool as { id: string }).id,
    p_manifiesto: amputada as unknown as Record<string, unknown>,
    p_motivo: 'Prueba de v0.75: manifiesto que valida y perdió las automatizaciones.',
    p_autor: AUTOR,
    p_revierte_a: null,
    p_prueba: true,
  })
  const enFallback7b = await estadoDeTodas(claves)
  // El registro de la ausencia es fire-and-forget a propósito: un cron no puede
  // esperar a que la fábrica lleve la cuenta. Acá hay que esperarlo, y decirlo:
  // sin esta línea la prueba leía la tabla antes de que terminaran los insert y
  // contaba uno de cuatro — un falso negativo por correr más rápido que el
  // sistema que mide.
  await new Promise((r) => setTimeout(r, 2000))
  const eventos7b = (await fallbacksRegistrados()).filter(
    (e) => (e.detalle as { automatizacion?: string })?.automatizacion,
  )
  const claves7b = new Set(eventos7b.map((e) => (e.detalle as { automatizacion: string }).automatizacion))
  paso(
    '7b',
    Object.keys(enFallback7b).length === claves.length &&
      Object.values(enFallback7b).every((v) => v === true) &&
      claves7b.size === claves.length,
    `manifiesto que SÍ valida y sin automatizaciones: las ${claves.length} caen al código y quedan ${claves7b.size} evento(s), uno por clave`,
  )
  console.log(`    claves registradas: ${[...claves7b].join(', ')}`)
  console.log(
    '    Una por clave y no una sola: son cuatro causas distintas, y juntarlas en\n' +
      '    un evento diría "algo pasó con las automatizaciones de Stock" sin decir\n' +
      '    cuál. Ninguna se pisa y ninguna se deduplica de más.',
  )

  /* ── 8 · DEJAR TODO COMO ESTABA ───────────────────────────────────── */
  const restaurada = await escribirVersion({
    clave: POOL,
    manifiesto: MANIFIESTOS[POOL].manifiesto,
    motivo: 'Fin de la prueba de v0.75: vuelve la declaración buena.',
    autorId: AUTOR,
    gobernando: true,
  })
  const r8 = await revertirPropuesta({
    propuestaId: r6.propuesta!.id,
    autorId: AUTOR,
    nota: 'Fin de la prueba de v0.75: las automatizaciones vuelven a estar activas.',
  })
  const final = await estadoDeTodas(claves)
  const estadosFinal = await estadoDelLector(PROYECTO_SOCIAL_AHORRO, { conAdmin: true })
  paso(
    '8',
    restaurada.ok &&
      r8.ok &&
      Object.keys(final).length === claves.length &&
      Object.values(final).every((v) => v === true) &&
      estadosFinal.find((e) => e.clave === POOL)?.lector === 'prendido',
    `declaración restaurada, overrides revertidos, lector ${estadosFinal.find((e) => e.clave === POOL)?.lector}`,
  )
  // Los demás que estaban prendidos y apagó el pánico.
  for (const e of alEmpezar) {
    if (e.clave === POOL) continue
    await cambiarEstadoLector({
      proyectoId: PROYECTO_SOCIAL_AHORRO,
      clave: e.clave,
      hasta: e.lector,
      usuarioId: AUTOR,
      motivo: 'Fin de la prueba de v0.75: vuelve como estaba antes del pánico.',
    })
  }
  const alTerminar = (await estadoDelLector(PROYECTO_SOCIAL_AHORRO, { conAdmin: true }))
    .filter((e) => e.lector !== 'apagado')
    .map((e) => `${e.clave} (${e.lector})`)
  paso(
    '9',
    alTerminar.length === alEmpezar.length,
    `los lectores quedan como estaban: ${alTerminar.join(', ')}`,
  )

  await cerrarPrueba()
  console.log('')
  process.exit(fallo ? 1 : 0)
}

main()
