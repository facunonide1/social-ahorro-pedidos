/**
 * LOS ARTEFACTOS DE PRUEBA: LOS QUE ESTÁN MARCADOS Y LOS QUE NO.
 *
 * Uso:
 *   npx tsx scripts/fabrica-limpiar-pruebas.ts            → sólo mira
 *   npx tsx scripts/fabrica-limpiar-pruebas.ts --limpiar  → borra lo marcado
 *   npx tsx scripts/fabrica-limpiar-pruebas.ts --marcar   → marca los viejos
 *
 * ── DOS PROBLEMAS DISTINTOS ─────────────────────────────────────────────────
 *
 * 1. Lo que las pruebas creen DE ACÁ EN ADELANTE: nace marcado, porque el
 *    escritor lee `FABRICA_PRUEBA` al insertar. Se borra con `--limpiar`.
 *
 * 2. Lo que las pruebas dejaron ANTES de que la marca existiera: no tiene cómo
 *    distinguirse por una columna. Se lo busca por el texto del motivo, que es
 *    una heurística y se dice que lo es. Se marca con `--marcar` y recién ahí
 *    entra al circuito normal.
 *
 * El segundo caso no se puede resolver bien, y por eso importa que exista el
 * primero: es la única forma de que esta lista deje de crecer.
 *
 * ── POR QUÉ NO BORRA LO VIGENTE ─────────────────────────────────────────────
 *
 * Una versión `es_actual` gobierna hoy, aunque haya nacido de una prueba.
 * Borrarla dejaría al pool sin declaración y al lector cayendo al código sin
 * que nadie lo haya decidido. Se informan aparte, y se arreglan publicando una
 * versión buena encima — no borrando.
 */
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const sb = createClient(url, key, { auth: { persistSession: false } })

const limpiar = process.argv.includes('--limpiar')
const marcar = process.argv.includes('--marcar')

const PATRONES = ['Prueba%', 'Fin de la prueba%', 'Restaurado tras la prueba%']

/**
 * Cómo se reconoce un artefacto viejo, tabla por tabla.
 *
 * Es texto del motivo que escribió un script, no una regla del sistema. Está
 * escrito mirando las filas, no de memoria.
 *
 * LOS PATRONES VAN ANCLADOS AL PRINCIPIO, y esa es toda la diferencia entre una
 * heurística y un desastre: buscando `%prueba%` suelto aparecen 10 versiones
 * REALES cuyo motivo dice "sólo comprueba que el archivo llame a la fábrica".
 * Diez declaraciones de verdad marcadas como basura por una subcadena.
 */
const VIEJOS: { tabla: string; columna: string; patrones: string[] }[] = [
  { tabla: 'fab_propuestas', columna: 'porque', patrones: PATRONES },
  { tabla: 'fab_pool_versiones', columna: 'notas_cambio', patrones: PATRONES },
  { tabla: 'fab_instalacion_versiones', columna: 'notas_cambio', patrones: PATRONES },
  { tabla: 'fab_procedencia', columna: 'motivo', patrones: PATRONES },
  { tabla: 'fab_lector_cambios', columna: 'motivo', patrones: PATRONES },
]

async function contarViejos(): Promise<{ tabla: string; sinMarcar: number; ids: string[] }[]> {
  const out: { tabla: string; sinMarcar: number; ids: string[] }[] = []
  for (const v of VIEJOS) {
    const ids: string[] = []
    for (const patron of v.patrones) {
      const { data } = await sb
        .from(v.tabla)
        .select('id')
        .eq('es_prueba', false)
        .ilike(v.columna, patron)
        .limit(1000)
      for (const f of (data ?? []) as { id: string }[]) if (!ids.includes(f.id)) ids.push(f.id)
    }
    out.push({ tabla: v.tabla, sinMarcar: ids.length, ids })
  }
  return out
}

async function main() {
  /* ── 1 · lo ya marcado ───────────────────────────────────────────────── */
  console.log('\n═══ MARCADOS COMO PRUEBA ═══\n')
  let marcados = 0
  for (const v of VIEJOS.map((x) => x.tabla).concat([
    'fab_lector_eventos',
    'fab_verificaciones',
    'fab_defectos_pieza',
    'fab_pedidos_construccion',
    'fab_chat_turnos',
  ])) {
    const { count } = await sb.from(v).select('id', { count: 'exact', head: true }).eq('es_prueba', true)
    marcados += count ?? 0
    if (count) console.log(`  ${v.padEnd(28)} ${count}`)
  }
  if (marcados === 0) console.log('  ninguno')

  /* ── 2 · los viejos, por heurística ──────────────────────────────────── */
  console.log('\n═══ SIN MARCAR, QUE PARECEN DE PRUEBA ═══')
  console.log('  (por el texto del motivo: es una conjetura, no una columna)\n')
  const viejos = await contarViejos()
  let totalViejos = 0
  for (const v of viejos) {
    totalViejos += v.sinMarcar
    if (v.sinMarcar) console.log(`  ${v.tabla.padEnd(28)} ${v.sinMarcar}`)
  }
  if (totalViejos === 0) console.log('  ninguno')

  /* ── 3 · marcar ──────────────────────────────────────────────────────── */
  if (marcar && totalViejos > 0) {
    console.log('\n═══ MARCANDO ═══\n')
    for (const v of viejos) {
      if (!v.sinMarcar) continue
      // De a 200: una lista de mil ids en un `in` no entra en la URL.
      let hechos = 0
      for (let i = 0; i < v.ids.length; i += 200) {
        const { error } = await sb.from(v.tabla).update({ es_prueba: true }).in('id', v.ids.slice(i, i + 200))
        if (error) console.log(`  ✗ ${v.tabla}: ${error.message}`)
        else hechos += v.ids.slice(i, i + 200).length
      }
      console.log(`  ✓ ${v.tabla.padEnd(28)} ${hechos} marcadas`)
    }
  }

  /* ── 4 · limpiar ─────────────────────────────────────────────────────── */
  if (limpiar) {
    console.log('\n═══ LIMPIANDO ═══\n')
    const { data, error } = await sb.rpc('fab_limpiar_pruebas')
    if (error) {
      console.log(`  ✗ ${error.message}`)
      process.exit(1)
    }
    let borradas = 0
    let vigentes = 0
    for (const f of (data ?? []) as { tabla: string; borradas: number; vigentes: number }[]) {
      borradas += f.borradas
      vigentes += f.vigentes
      if (f.borradas || f.vigentes) {
        console.log(
          `  ${f.tabla.padEnd(28)} borradas ${String(f.borradas).padStart(4)}` +
            (f.vigentes ? `  · ${f.vigentes} marcada(s) y VIGENTE(s): no se borran` : ''),
        )
      }
    }
    console.log(`\n  total borradas: ${borradas}`)
    if (vigentes > 0) {
      console.log(
        `  ${vigentes} quedaron: son la declaración que gobierna hoy. Se arreglan\n` +
          '  publicando una versión buena encima, no borrándolas.',
      )
    }
  }

  if (!limpiar && !marcar) {
    console.log('\n  (sólo miró. --marcar para marcar los viejos, --limpiar para borrar lo marcado)\n')
  } else {
    console.log('')
  }
}

main()
