/**
 * Chequeo CENSO ↔ MANIFIESTOS ↔ CÓDIGO, desde la consola.
 *
 * Uso:  npx tsx scripts/fabrica-censar.ts            → sólo informa
 *       npx tsx scripts/fabrica-censar.ts --aplicar  → corrige el censo
 *
 * Sale con código 1 si hay contradicciones sin corregir, para que pueda
 * bloquear un deploy.
 */
import { createClient } from '@supabase/supabase-js'
import { chequearCenso, correcciones, resumir, sinDeclarar } from '../lib/fabrica/censo'
import type { SectorCenso } from '../lib/fabrica/tipos'

const PROYECTO = '00000000-0000-0000-0000-000000000001'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const sb = createClient(url, key, { auth: { persistSession: false } })

async function main() {
  const aplicar = process.argv.includes('--aplicar')

  const { data } = await sb
    .from('fab_censo_sectores')
    .select('*')
    .eq('proyecto_id', PROYECTO)
  const censo = (data ?? []) as SectorCenso[]

  const contradicciones = await chequearCenso(censo, sb as never)

  console.log('\n── CENSO ↔ MANIFIESTOS ──────────────────────────────────')
  console.log(`  ${resumir(contradicciones)}\n`)

  for (const c of contradicciones) {
    const marca = c.gravedad === 'error' ? '✗' : '~'
    const flecha = c.sentido === 'censo→real' ? '→' : '←'
    console.log(`  ${marca} ${c.sector}.${c.campo}`)
    console.log(`      censo: ${c.censo}  ${flecha}  real: ${c.real}`)
  }

  const pendientes = sinDeclarar(censo)
  console.log(`\n── COBERTURA ────────────────────────────────────────────`)
  console.log(
    `  ${censo.length - pendientes.length} de ${censo.length} sectores declarados`,
  )
  if (pendientes.length > 0) {
    console.log(`  Sin declarar: ${pendientes.map((s) => s.clave).join(', ')}`)
  }

  if (contradicciones.length === 0) {
    console.log('')
    process.exit(0)
  }

  const fixes = correcciones(contradicciones)
  if (!aplicar) {
    console.log(
      `\n  ${fixes.size} sector(es) se pueden corregir con --aplicar. ` +
        `Las contradicciones sin corrección automática necesitan una decisión.\n`,
    )
    process.exit(1)
  }

  console.log('\n── APLICANDO ────────────────────────────────────────────')
  for (const [clave, campos] of fixes) {
    const nota = `Corregido automáticamente contra el manifiesto: ${Object.keys(campos).join(', ')}.`
    const { data: previo } = await sb
      .from('fab_censo_sectores')
      .select('notas')
      .eq('proyecto_id', PROYECTO)
      .eq('clave', clave)
      .maybeSingle()

    const { error } = await sb
      .from('fab_censo_sectores')
      .update({
        ...campos,
        // El registro de qué se corrigió queda en la fila: el censo es una
        // observación, y una observación corregida sin dejar rastro es una
        // observación que ya no se puede auditar.
        notas: `${previo?.notas ?? ''} · ${nota}`.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq('proyecto_id', PROYECTO)
      .eq('clave', clave)

    console.log(error ? `  ✗ ${clave}: ${error.message}` : `  ✓ ${clave}: ${Object.keys(campos).join(', ')}`)
  }
  console.log('')
  process.exit(0)
}

main()
