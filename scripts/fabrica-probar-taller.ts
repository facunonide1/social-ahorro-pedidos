/**
 * Los siete pasos de la prueba del Taller, sobre el pool prendido.
 *
 * Uso: npx tsx scripts/fabrica-probar-taller.ts
 * Deja el título como estaba. Sale 1 si algún paso falla.
 */
import { aplicar, listarPropuestas, proponer, revertirPropuesta } from '../lib/fabrica/propuestas'
// Se MIRA con `tituloGobernante`, que no compara ni registra: pasar un literal
// inventado como 'FALLBACK' lo dejaba en el log como una diferencia real.
import { tituloGobernante } from '../lib/fabrica/lector'
import { versionActual } from '../lib/fabrica/versiones'
import { PROYECTO_SOCIAL_AHORRO } from '../lib/fabrica/flag'
import { abrirPrueba, cerrarPrueba } from './fabrica-marco-de-prueba'

// Antes de la primera escritura: lo que se escriba antes nace sin marca.
abrirPrueba()

const POOL = 'documentos'
const RUTA = '/admin/finanzas/documentos/lote'
const AUTOR = '5bf8468f-c6a2-4231-8bcb-3c943777bf03'
const NUEVO = 'Carga masiva de facturas'

let fallo = false
function paso(n: number, ok: boolean, texto: string) {
  if (!ok) fallo = true
  console.log(`\n${ok ? '✓' : '✗'} PASO ${n} · ${texto}`)
}

async function main() {
  const version = await versionActual(POOL)
  const original = await tituloGobernante(POOL, RUTA)
  console.log(`Pool ${POOL} · pieza v${version?.numero} · título hoy: "${original}"`)

  /* ── 1 · pedir un cambio de etiqueta ─────────────────────────────── */
  const r1 = await proponer({
    proyectoId: PROYECTO_SOCIAL_AHORRO,
    clave: POOL,
    cambio: { titulos: { [RUTA]: NUEVO } },
    porque: 'El equipo de administración la llama "carga masiva", no "en lote". Prueba de la sesión v0.65.',
    autorId: AUTOR,
  })
  paso(1, r1.ok, `propuesta creada${r1.ok ? '' : ` · ${r1.error}`}`)
  const p = r1.propuesta

  /* ── 2 · cae en amarillo por la regla de arranque ─────────────────── */
  paso(2, p?.carril === 'amarillo', `carril: ${p?.carril} — ${p?.carrilMotivo}`)

  /* ── 3 · las cinco cosas, con el costo de revertir ────────────────── */
  const cinco =
    !!p &&
    p.queCambia.length > 0 &&
    !!p.porque &&
    p.afecta.personas > 0 &&
    !!p.carrilMotivo &&
    !!p.costoRevertir
  paso(3, cinco, 'la propuesta declara las cinco cosas')
  if (p) {
    console.log(`    qué cambia:  ${p.queCambia.map((d) => d.texto).join(' · ')}`)
    console.log(`    por qué:     ${p.porque}`)
    console.log(`    a quién:     ${p.afecta.pantallas} pantalla(s), ${p.afecta.personas} persona(s)`)
    console.log(`    carril:      ${p.carril} — ${p.carrilMotivo}`)
    console.log(`    revertir:    ${p.costoRevertir}`)
  }

  /* ── 4 · aprobar y ver el cambio sin deploy ───────────────────────── */
  const r4 = await aplicar({ propuestaId: p!.id, autorId: AUTOR })
  const enVivo = await tituloGobernante(POOL, RUTA)
  paso(4, r4.ok && enVivo === NUEVO, `la pantalla ahora devuelve "${enVivo}" sin deploy`)

  /* ── 5 · revertir desde el Taller ─────────────────────────────────── */
  const r5 = await revertirPropuesta({
    propuestaId: p!.id,
    autorId: AUTOR,
    nota: 'Fin de la prueba: vuelve al título anterior.',
  })
  const trasRevertir = await tituloGobernante(POOL, RUTA)
  paso(5, r5.ok && trasRevertir === original, `volvió a "${trasRevertir}"${r5.ok ? '' : ` · ${r5.error}`}`)

  /* ── 6 · intentar algo PROHIBIDO ──────────────────────────────────── */
  // Subir la participación de una acción protegida por confirmación humana.
  const r6 = await proponer({
    proyectoId: PROYECTO_SOCIAL_AHORRO,
    clave: POOL,
    cambio: {
      agentes: {
        lector_de_papeles: { participacion: { extraer_documento: 'hace_y_avisa' } },
      },
    },
    porque: 'Prueba a propósito: subir la autonomía de una acción que la constitución protege.',
    autorId: AUTOR,
  })
  paso(6, r6.ok, 'se pidió un cambio prohibido a propósito')

  /* ── 7 · rechazado, registrado y legible ──────────────────────────── */
  const prohibida = r6.propuesta
  const todas = await listarPropuestas(PROYECTO_SOCIAL_AHORRO, { conAdmin: true })
  const registrada = todas.find((x) => x.id === prohibida?.id)
  const ok7 =
    prohibida?.carril === 'rojo' &&
    registrada?.estado === 'rechazada' &&
    !!registrada?.carrilMotivo &&
    registrada.carrilMotivo.length > 30
  paso(7, ok7, `carril ${prohibida?.carril} · estado ${registrada?.estado}`)
  console.log(`    motivo: ${registrada?.carrilMotivo}`)

  await cerrarPrueba()
  console.log('')
  process.exit(fallo ? 1 : 0)
}

main()
