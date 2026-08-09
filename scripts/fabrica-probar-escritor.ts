/**
 * Los cinco pasos de la prueba de escritura y revert.
 *
 * Se corre sobre un pool que esté PRENDIDO: la prueba no vale si el cambio no
 * llega a ninguna pantalla. Cambia un título, verifica que gobierna, revierte de
 * un toque, verifica que volvió, y confirma que las tres versiones quedaron.
 *
 * Uso: npx tsx scripts/fabrica-probar-escritor.ts [pool]
 * Deja el pool con el título original. Sale 1 si algún paso falla.
 */
import { createClient } from '@supabase/supabase-js'
import {
  aplicarCambio,
  diffLegible,
  escribirVersion,
  personasQueLoVen,
  revertirA,
} from '../lib/fabrica/escritor'
import { historial, versionActual } from '../lib/fabrica/versiones'
// Se MIRA con `tituloGobernante`, que no compara ni registra: pasar un literal
// inventado como 'FALLBACK' lo dejaba en el log como una diferencia real.
import { tituloDePantalla } from '../lib/os/definicion'
import { tituloGobernante } from '../lib/fabrica/lector'
import { PROYECTO_SOCIAL_AHORRO } from '../lib/fabrica/flag'

const POOL = process.argv[2] ?? 'documentos'
const RUTA = '/admin/finanzas/documentos/revision/[id]'
const TITULO_PRUEBA = 'Revisión de factura'
const AUTOR = '5bf8468f-c6a2-4231-8bcb-3c943777bf03'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const sb = createClient(url, key, { auth: { persistSession: false } })

let fallo = false
function paso(n: number, ok: boolean, texto: string) {
  if (!ok) fallo = true
  console.log(`\n${ok ? '✓' : '✗'} PASO ${n} · ${texto}`)
}

async function estaGobernando(): Promise<boolean> {
  const { data } = await sb
    .from('fab_instalaciones')
    .select('lector, pool:fab_pools!inner(clave)')
    .eq('proyecto_id', PROYECTO_SOCIAL_AHORRO)
    .eq('fab_pools.clave', POOL)
    .maybeSingle()
  return (data as unknown as { lector: string } | null)?.lector === 'prendido'
}

async function main() {
  const gobernando = await estaGobernando()
  console.log(`Pool: ${POOL} · ¿gobierna?: ${gobernando ? 'sí' : 'NO — la prueba no valdría'}`)
  if (!gobernando) {
    console.log('\nLa prueba necesita el pool prendido. Abortando sin tocar nada.\n')
    process.exit(1)
  }

  const inicial = await versionActual(POOL)
  if (!inicial) {
    console.log('\nNo hay versión actual. Abortando.\n')
    process.exit(1)
  }
  const tituloOriginal =
    inicial.manifiesto.pantallas.find((p) => p.ruta === RUTA)?.titulo ?? ''
  console.log(`Versión actual: ${inicial.numero} · título de ${RUTA}: "${tituloOriginal}"`)

  /* ── 1 · cambiar un título con el escritor ─────────────────────────── */
  const propuesto = aplicarCambio(inicial.manifiesto, { titulos: { [RUTA]: TITULO_PRUEBA } })
  const personas = await personasQueLoVen(inicial.manifiesto)
  const diff = diffLegible(inicial.manifiesto, propuesto, {
    gobernando: true,
    personasConAcceso: personas,
  })
  console.log('\n  Diff antes de aplicar:')
  for (const d of diff) {
    console.log(`    · ${d.texto}`)
    console.log(`      costo: ${d.costo}`)
  }

  const escrita = await escribirVersion({
    clave: POOL,
    manifiesto: propuesto,
    motivo: 'Prueba de escritura y revert de la sesión v0.63.',
    autorId: AUTOR,
    gobernando: true,
  })
  paso(
    1,
    escrita.ok && diff.length === 1,
    `escritura: versión ${escrita.numero ?? '—'} creada` +
      (escrita.ok ? '' : ` · ${escrita.error ?? JSON.stringify(escrita.rechazos)}`),
  )

  /* ── 2 · el cambio gobierna, sin deploy ────────────────────────────── */
  // Acá sí se pasa el literal REAL —el título original—, así que la comparación
  // que dispare es legítima. Lo que no se puede es inventar un literal.
  const enVivo = await tituloDePantalla(POOL, RUTA, tituloOriginal)
  paso(
    2,
    enVivo === TITULO_PRUEBA,
    `la pantalla ahora devuelve "${enVivo}" (el código sigue diciendo "${tituloOriginal}")`,
  )

  /* ── 3 · revertir de un toque ──────────────────────────────────────── */
  const revertida = await revertirA({
    clave: POOL,
    versionId: inicial.id,
    motivo: 'Fin de la prueba: vuelve al título anterior.',
    autorId: AUTOR,
    gobernando: true,
  })
  paso(
    3,
    revertida.ok,
    `revert a la versión ${inicial.numero}: creó la versión ${revertida.numero ?? '—'}` +
      (revertida.ok ? '' : ` · ${revertida.error ?? ''}`),
  )

  /* ── 4 · volvió ────────────────────────────────────────────────────── */
  const trasRevertir = await tituloGobernante(POOL, RUTA)
  paso(
    4,
    trasRevertir === tituloOriginal,
    `la pantalla volvió a devolver "${trasRevertir}"`,
  )

  /* ── 5 · las tres versiones quedaron ───────────────────────────────── */
  const h = await historial(POOL, { conAdmin: true })
  const tresUltimas = h.slice(0, 3)
  const historiaCompleta =
    h.length >= 3 &&
    tresUltimas[0].esActual &&
    tresUltimas[0].revierteA === inicial.id &&
    !tresUltimas[1].esActual &&
    !tresUltimas[2].esActual
  paso(5, historiaCompleta, `historial: ${h.length} versiones, ninguna borrada`)
  for (const v of tresUltimas) {
    console.log(
      `    v${v.numero}${v.esActual ? ' (actual)' : ''} · ${v.motivo ?? 'sin motivo'}` +
        (v.revierteA ? ` · revierte a la ${h.find((x) => x.id === v.revierteA)?.numero}` : ''),
    )
  }

  console.log('')
  process.exit(fallo ? 1 : 0)
}

main()
