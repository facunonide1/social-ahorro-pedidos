/**
 * Verificador de la FÁBRICA.
 *
 * Corre el MISMO comparador que la pantalla, sobre todos los manifiestos
 * registrados, desde la consola. Existe porque un comparador que sólo se puede
 * ejecutar dentro de Next es un comparador que nadie corre antes de commitear.
 *
 * Uso:  npx tsx scripts/fabrica-verificar.ts [clave...]
 * Sale con código 1 si algún pool difiere.
 */
import { createClient } from '@supabase/supabase-js'
import { MANIFIESTOS } from '../lib/fabrica/manifiestos'
import { verificarEspejo } from '../lib/fabrica/comparador'
import { validarManifiesto, validarCatalogo, FORMATO_ACTUAL } from '../lib/fabrica/validador'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const sb = createClient(url, key, { auth: { persistSession: false } })

async function main() {
  const pedidas = process.argv.slice(2)
  const claves = pedidas.length > 0 ? pedidas : Object.keys(MANIFIESTOS)
  let fallo = false

  console.log('\n── FORMATO ──────────────────────────────────────────────')
  for (const clave of claves) {
    const entrada = MANIFIESTOS[clave]
    if (!entrada) {
      console.log(`  ✗ ${clave}: no hay manifiesto registrado`)
      fallo = true
      continue
    }
    const r = validarManifiesto(entrada.manifiesto)
    // Un aviso NO hace fallar la corrida. En modo espejo, algunos avisos son
    // hallazgos sobre el sistema real que hay que dejar a la vista, no
    // defectos de la declaración: taparlos para que el validador dé verde
    // sería declarar un sistema que no existe.
    const errores = r.filter((p) => p.gravedad === 'error')
    if (errores.length > 0) fallo = true
    if (r.length === 0) {
      console.log(`  ✓ ${clave.padEnd(10)} válido contra el esquema ${FORMATO_ACTUAL}`)
    } else {
      console.log(
        `  ${errores.length > 0 ? '✗' : '~'} ${clave.padEnd(10)} ` +
          `${errores.length} error(es), ${r.length - errores.length} aviso(s):`,
      )
      for (const p of r) console.log(`      ${p.gravedad === 'error' ? '·' : '~'} ${p.campo}: ${p.mensaje}`)
    }
  }

  console.log('\n── CATÁLOGO (coherencia entre manifiestos) ──────────────')
  const cat = validarCatalogo(Object.values(MANIFIESTOS).map((e) => e.manifiesto))
  if (cat.length === 0) {
    console.log('  ✓ sin contradicciones entre los pools declarados')
  } else {
    for (const p of cat) {
      if (p.gravedad === 'error') fallo = true
      console.log(`  ${p.gravedad === 'error' ? '✗' : '~'} ${p.campo}: ${p.mensaje}`)
    }
  }

  console.log('\n── ESPEJO (declaración ↔ código) ────────────────────────')
  for (const clave of claves) {
    const entrada = MANIFIESTOS[clave]
    if (!entrada) continue
    const v = await verificarEspejo(entrada.manifiesto, entrada.prefijos, sb, entrada.excluir)
    const marca = v.resultado === 'coincide' ? '✓' : '✗'
    if (v.resultado !== 'coincide') fallo = true
    console.log(`  ${marca} ${clave.padEnd(10)} ${v.resumen}`)
    for (const d of v.diferencias) {
      console.log(`      · [${d.tipo}] ${d.elemento} — ${d.nota}`)
    }
  }

  console.log('')
  process.exit(fallo ? 1 : 0)
}

main()
