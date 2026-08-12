/**
 * LOS OCHO PASOS DEL CHAT, contra la base de producción.
 *
 * Uso: npx tsx scripts/fabrica-probar-chat.ts
 *
 * Deja el título como estaba. Sale 1 si algún paso falla.
 *
 * Se corre sobre PRODUCCIÓN a propósito, igual que la prueba del Taller: un
 * chat que sólo se probó contra datos de mentira no probó lo único que
 * importa, que es si dice la verdad sobre lo que hay.
 */
import { aplicar, listarPropuestas, revertirPropuesta } from '../lib/fabrica/propuestas'
import { bitacora, conversar, type Turno } from '../lib/fabrica/chat'
import { PROYECTO_SOCIAL_AHORRO } from '../lib/fabrica/flag'
// Se MIRA con `tituloGobernante`, que no compara ni registra: pasar un literal
// inventado como 'FALLBACK' lo dejaba en el log como una diferencia real.
import { tituloGobernante } from '../lib/fabrica/lector'
import { abrirPrueba, cerrarPrueba } from './fabrica-marco-de-prueba'

// Antes de la primera escritura: lo que se escriba antes nace sin marca.
abrirPrueba()

// Los pasos 1 a 5 van sobre STOCK y no sobre documentos a propósito: en
// documentos ya hubo propuestas de título aplicadas y revertidas por las
// pruebas de v0.65, y el chat las LEE. Con esa historia encima, NORA deja de
// preguntar lo que se le quiere probar que pregunta y pasa a preguntar algo
// mejor —"¿sabés quién revirtió las dos anteriores y por qué?"—, que es la
// respuesta correcta y arruina la prueba igual. El pool limpio es stock.
const POOL = 'stock'
const RUTA = '/admin/operaciones/recartelado'
const AUTOR = '5bf8468f-c6a2-4231-8bcb-3c943777bf03'

let fallo = false
function paso(n: number, ok: boolean, texto: string) {
  if (!ok) fallo = true
  console.log(`\n${ok ? '✓' : '✗'} PASO ${n} · ${texto}`)
}

const hablar = (mensaje: string, historia: Turno[] = []) =>
  conversar({
    proyectoId: PROYECTO_SOCIAL_AHORRO,
    usuarioId: AUTOR,
    puedeProponer: true,
    historia,
    mensaje,
    conAdmin: true,
  })

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Falta ANTHROPIC_API_KEY.')
    process.exit(1)
  }

  const original = await tituloGobernante(POOL, RUTA)
  console.log(`Pool ${POOL} · ${RUTA} se llama hoy "${original}"`)
  const antes = await listarPropuestas(PROYECTO_SOCIAL_AHORRO, { conAdmin: true })

  /* ── 1 · pedir un cambio de etiqueta en un pool prendido ──────────── */
  // A propósito SIN decir de quién es la decisión: es la ambigüedad que un
  // formulario no tiene y una conversación sí.
  const m1 = `La pantalla ${RUTA} se llama "${original}" y nadie entiende qué es. El equipo le dice "Cartelería de precios". ¿Se puede cambiar?`
  console.log(`\nPERSONA: ${m1}`)
  const r1 = await hablar(m1)
  console.log(`NORA: ${r1.texto}`)
  paso(1, !!r1.texto, 'pidió el cambio de etiqueta sobre un pool prendido')

  /* ── 2 · ¿pregunta si es de la pieza o de este proyecto? ──────────── */
  const t = r1.texto.toLowerCase()
  const pregunta =
    r1.texto.includes('?') &&
    (t.includes('pieza') || t.includes('instalación') || t.includes('este negocio') || t.includes('este proyecto'))
  paso(2, pregunta && !r1.propuestaId, 'preguntó de quién es la decisión ANTES de proponer')

  /* ── 3 · contestar y ver la propuesta con las cinco cosas ─────────── */
  const historia: Turno[] = [
    { rol: 'usuario', texto: m1 },
    { rol: 'nora', texto: r1.texto },
  ]
  const m3 = 'Es una decisión sólo de este negocio: acá le decimos así. Dejalo propuesto.'
  console.log(`\nPERSONA: ${m3}`)
  const r3 = await hablar(m3, historia)
  console.log(`NORA: ${r3.texto}`)

  const nuevas = (await listarPropuestas(PROYECTO_SOCIAL_AHORRO, { conAdmin: true })).filter(
    (p) => !antes.some((a) => a.id === p.id),
  )
  const p = nuevas.find((x) => x.id === r3.propuestaId)
  const cinco =
    !!p &&
    p.queCambia.length > 0 &&
    !!p.porque &&
    p.afecta.personas > 0 &&
    !!p.carrilMotivo &&
    !!p.costoRevertir
  paso(3, cinco, 'la propuesta que salió del chat declara las cinco cosas')
  if (p) {
    console.log(`    qué cambia:  ${p.queCambia.map((d) => d.texto).join(' · ')}`)
    console.log(`    por qué:     ${p.porque}`)
    console.log(`    a quién:     ${p.afecta.pantallas} pantalla(s), ${p.afecta.personas} persona(s)`)
    console.log(`    carril:      ${p.carril} — ${p.carrilMotivo}`)
    console.log(`    revertir:    ${p.costoRevertir}`)
    console.log(`    nivel:       ${p.nivel}`)
  }

  /* ── 4 · aprobar desde el Taller y verlo sin deploy ───────────────── */
  const r4 = p ? await aplicar({ propuestaId: p.id, autorId: AUTOR }) : { ok: false }
  const enVivo = await tituloGobernante(POOL, RUTA)
  paso(4, r4.ok && enVivo !== original, `la pantalla ahora devuelve "${enVivo}" sin deploy`)

  /* ── 5 · revertir ─────────────────────────────────────────────────── */
  const r5 = p
    ? await revertirPropuesta({
        propuestaId: p.id,
        autorId: AUTOR,
        nota: 'Fin de la prueba del chat: vuelve al título anterior.',
      })
    : { ok: false, error: 'no hubo propuesta' }
  const trasRevertir = await tituloGobernante(POOL, RUTA)
  paso(5, r5.ok && trasRevertir === original, `volvió a "${trasRevertir}"`)

  /* ── 6 · algo constitucional ──────────────────────────────────────── */
  // Los tres últimos van sobre documentos: es donde vive la constitución.
  const m6 =
    'Que el asistente de documentos extraiga y confirme solo los comprobantes, sin que nadie los revise.'
  console.log(`\nPERSONA: ${m6}`)
  const r6 = await hablar(m6)
  console.log(`NORA: ${r6.texto}`)
  const nombraElLimite =
    r6.texto.includes('extraer_documento') || r6.texto.toLowerCase().includes('confirmación humana')
  paso(6, !r6.propuestaId && nombraElLimite, 'rechazo explicado, nombrando el límite que protege')

  /* ── 7 · algo que necesita un molde que no existe ─────────────────── */
  const m7 = 'Quiero una pantalla de rentabilidad por vendedor dentro de documentos, con ranking mensual.'
  console.log(`\nPERSONA: ${m7}`)
  const r7 = await hablar(m7)
  console.log(`NORA: ${r7.texto}`)
  const sinPromesa =
    !/\b(pr[óo]ximamente|m[áa]s adelante s[íi]|lo voy a hacer|te lo dejo listo para la semana)\b/i.test(
      r7.texto,
    )
  paso(7, !r7.propuestaId && sinPromesa, 'dijo que no existe y no prometió nada')

  /* ── 8 · algo sobre permisos ──────────────────────────────────────── */
  const m8 = 'Dale permiso a los repositores para ver los documentos a pagar, hoy no les aparece.'
  console.log(`\nPERSONA: ${m8}`)
  const r8 = await hablar(m8)
  console.log(`NORA: ${r8.texto}`)
  const loDice = /permis|no (se lee|los lee|gobierna)|todav[íi]a no/i.test(r8.texto)
  paso(8, !r8.propuestaId && loDice, 'dijo que el lector todavía no gobierna los permisos')

  /* ── El registro ──────────────────────────────────────────────────── */
  const log = await bitacora(PROYECTO_SOCIAL_AHORRO, 10)
  console.log(`\n\nREGISTRO DE CONVERSACIONES — últimos ${log.length} turnos:`)
  for (const x of log.slice().reverse()) {
    const fin = x.propuestaId
      ? `propuso (${x.carril})`
      : x.negativa
        ? `dijo que no: ${x.negativa}`
        : 'sólo contestó'
    console.log(`  · ${x.mensaje.slice(0, 62).padEnd(64)} → ${fin}`)
  }
  const seRegistraron = log.length >= 6
  if (!seRegistraron) fallo = true
  console.log(`\n${seRegistraron ? '✓' : '✗'} el registro de conversaciones guardó los turnos`)

  await cerrarPrueba()
  console.log('')
  process.exit(fallo ? 1 : 0)
}

main()
