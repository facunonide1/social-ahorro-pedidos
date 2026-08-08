/**
 * Publica la semilla del repo como versión nueva, pasando por el escritor.
 *
 * NO es el sembrador de v0.58: aquel escribía la tabla directo. Éste pasa por
 * `escribirVersion`, o sea que valida, versiona, exige motivo y queda auditado.
 *
 * Sirve para dos cosas: arrancar un proyecto en frío, y volver a alinear la base
 * con el repo cuando el formato subió y las filas quedaron atrás — que fue
 * justamente lo que pasó entre v0.61 y v0.63.
 *
 * Uso: npx tsx scripts/fabrica-publicar.ts "motivo" [pool...]
 */
import { MANIFIESTOS } from '../lib/fabrica/manifiestos'
import { escribirVersion } from '../lib/fabrica/escritor'
import { versionActual } from '../lib/fabrica/versiones'
import { createClient } from '@supabase/supabase-js'
import { PROYECTO_SOCIAL_AHORRO } from '../lib/fabrica/flag'

const AUTOR = '5bf8468f-c6a2-4231-8bcb-3c943777bf03'

const motivo = process.argv[2]
if (!motivo) {
  console.error('Falta el motivo. Un cambio de declaración sin motivo no se guarda.')
  process.exit(1)
}
const claves = process.argv.slice(3)

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const sb = createClient(url, key, { auth: { persistSession: false } })

async function gobernando(clave: string): Promise<boolean> {
  const { data } = await sb
    .from('fab_instalaciones')
    .select('lector, pool:fab_pools!inner(clave)')
    .eq('proyecto_id', PROYECTO_SOCIAL_AHORRO)
    .eq('fab_pools.clave', clave)
    .maybeSingle()
  return (data as unknown as { lector: string } | null)?.lector === 'prendido'
}

async function main() {
  const objetivo = claves.length > 0 ? claves : Object.keys(MANIFIESTOS)
  let fallo = false

  for (const clave of objetivo) {
    const entrada = MANIFIESTOS[clave]
    if (!entrada) {
      console.log(`  ✗ ${clave}: no hay semilla en el repo`)
      fallo = true
      continue
    }

    const r = await escribirVersion({
      clave,
      manifiesto: entrada.manifiesto,
      motivo,
      autorId: AUTOR,
      gobernando: await gobernando(clave),
    })

    if (r.ok) {
      const v = await versionActual(clave)
      console.log(`  ✓ ${clave.padEnd(14)} versión ${r.numero} · formato ${v?.manifiesto.formato}`)
    } else {
      fallo = true
      console.log(`  ✗ ${clave.padEnd(14)} ${r.error ?? ''}`)
      for (const x of r.rechazos ?? []) console.log(`      paso ${x.paso}: ${x.motivo}`)
    }
  }

  process.exit(fallo ? 1 : 0)
}

main()
