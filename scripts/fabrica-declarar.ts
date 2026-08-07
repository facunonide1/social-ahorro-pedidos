/**
 * Sembrador de declaraciones de la FÁBRICA.
 *
 * Escribe en `fab_pools` / `fab_pool_versiones` / `fab_instalaciones` a partir
 * de los manifiestos que viven en código. Existe para que el manifiesto tenga
 * UNA sola fuente: armar el INSERT a mano por cada pool garantiza que la copia
 * de la base y la de código se separen en la tercera declaración.
 *
 * Uso:  npx tsx scripts/fabrica-declarar.ts [clave...]
 *       sin argumentos declara todos los manifiestos registrados.
 *
 * FRONTERA: sólo escribe tablas fab_*.
 */
import { createClient } from '@supabase/supabase-js'
import { MANIFIESTOS } from '../lib/fabrica/manifiestos'

const PROYECTO = '00000000-0000-0000-0000-000000000001'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const sb = createClient(url, key, { auth: { persistSession: false } })

async function declarar(clave: string) {
  const entrada = MANIFIESTOS[clave]
  if (!entrada) {
    console.error(`  ✗ ${clave}: no hay manifiesto registrado`)
    return
  }
  const m = entrada.manifiesto

  const { data: pool, error: e1 } = await sb
    .from('fab_pools')
    .upsert(
      {
        clave: m.pool,
        nombre: m.nombre,
        descripcion: m.descripcion ?? null,
        categoria: m.categoria,
        estado: 'declarado',
        depende_de: m.depende_de,
        rubros: [],
        origen_proyecto_id: PROYECTO,
      },
      { onConflict: 'clave' },
    )
    .select('id')
    .single()
  if (e1 || !pool) return console.error(`  ✗ ${clave}: pool — ${e1?.message}`)

  const { data: version, error: e2 } = await sb
    .from('fab_pool_versiones')
    .upsert(
      {
        pool_id: pool.id,
        version: '1.0.0',
        manifiesto: m as unknown as Record<string, unknown>,
        estado: 'publicada',
        modo: 'espejo',
        notas_cambio: 'Declaración en espejo, sembrada desde el manifiesto en código.',
        publicada_at: new Date().toISOString(),
      },
      { onConflict: 'pool_id,version' },
    )
    .select('id')
    .single()
  if (e2 || !version) return console.error(`  ✗ ${clave}: versión — ${e2?.message}`)

  const configuracion: Record<string, unknown> = {}
  for (const c of m.configurable ?? []) configuracion[c.clave] = c.default

  const { error: e3 } = await sb.from('fab_instalaciones').upsert(
    {
      proyecto_id: PROYECTO,
      pool_id: pool.id,
      version_id: version.id,
      estado: 'activa',
      configuracion,
      instalada_at: new Date().toISOString(),
      notas: 'Instalación en espejo: el código ya estaba. La fábrica sólo lo declara.',
    },
    { onConflict: 'proyecto_id,pool_id' },
  )
  if (e3) return console.error(`  ✗ ${clave}: instalación — ${e3.message}`)

  console.log(
    `  ✓ ${m.pool.padEnd(10)} ${m.categoria.padEnd(9)} ` +
      `${m.entidades.length} entidades · ${m.pantallas.length} pantallas · ` +
      `${m.acciones.length} acciones · ${(m.agentes ?? []).length} agentes`,
  )
}

async function main() {
  const claves = process.argv.slice(2)
  const objetivo = claves.length > 0 ? claves : Object.keys(MANIFIESTOS)
  console.log(`Declarando ${objetivo.length} pool(s):`)
  for (const c of objetivo) await declarar(c)
}

main()
