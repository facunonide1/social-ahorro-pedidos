/**
 * Verificación provocada, desde la consola.
 *
 * Reemplaza a `fabrica-sombra.ts`, que llevaba a mano la lista de pantallas
 * cableadas. Esa lista era el problema: un pool en sombra sin cablear daba
 * "0 diferencias" por no mirar nada, y la lista escrita a mano hacía creer que
 * el sistema sabía qué estaba cableado cuando en realidad se lo habíamos dicho
 * nosotros. Ahora se detecta en tiempo de ejecución.
 *
 * Uso: npx tsx scripts/fabrica-verificar-pool.ts [pool...]
 * Sin argumentos: todos los que no estén apagados.
 */
import { createClient } from '@supabase/supabase-js'
import { verificarPool } from '../lib/fabrica/verificador'
import { PROYECTO_SOCIAL_AHORRO } from '../lib/fabrica/flag'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const sb = createClient(url, key, { auth: { persistSession: false } })

async function main() {
  let claves = process.argv.slice(2)
  if (claves.length === 0) {
    const { data } = await sb
      .from('fab_instalaciones')
      .select('lector, pool:fab_pools!inner(clave)')
      .eq('proyecto_id', PROYECTO_SOCIAL_AHORRO)
      .neq('lector', 'apagado')
    claves = ((data ?? []) as unknown as { pool: { clave: string } }[]).map((x) => x.pool.clave)
  }

  let problemas = 0
  for (const clave of claves) {
    const r = await verificarPool({ proyectoId: PROYECTO_SOCIAL_AHORRO, clave })
    problemas += r.diferencias
    console.log(
      `\n${r.diferencias === 0 ? '✓' : '~'} ${clave} · lector ${r.estadoLector}\n` +
        `  declaradas ${r.declaradas} · cableadas ${r.cableadas} · resueltas ${r.resueltas} · problemas ${r.diferencias}`,
    )
    for (const p of r.pantallas.filter((x) => x.problema)) {
      console.log(`    · ${p.ruta} → ${p.problema}`)
    }
  }
  if (claves.length === 0) console.log('\nNingún pool activo: no hay nada que verificar.')
  console.log('')
  process.exit(problemas > 0 ? 1 : 0)
}

main()
