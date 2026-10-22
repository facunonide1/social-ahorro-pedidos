/**
 * CUÁNTAS FILAS TIENE CADA TABLA Y CADA VISTA, CONTADAS EN LA BASE.
 *
 * El auditor de cortes tenía la lista escrita a mano, con los conteos de
 * agosto. `transferir_antes_de_comprar` —una vista de la v0.96 con 2.909
 * filas— no estaba, y por eso el corte silencioso de la v0.98 pasó.
 *
 * Esto la genera. Se guarda en `scripts/conteo-relaciones.json` y se versiona,
 * para que el build de Vercel no dependa de poder consultar la base.
 *
 * ── POR QUÉ UNA CONSULTA POR RELACIÓN ───────────────────────────────────────
 *
 * La primera versión contaba todo dentro de una función de Postgres y el
 * statement externo se cancelaba por timeout acumulado: una vista cara se
 * llevaba puesta la cuenta de las otras ciento cincuenta.
 *
 * Así cada cuenta es su propia request: la que tarde de más falla sola y se
 * anota como desconocida, sin arrastrar a las demás.
 *
 *   npm run contar:relaciones
 */
import { writeFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

function env(n) {
  const v = process.env[n]
  if (!v) throw new Error(`Falta ${n}`)
  return v
}

const adm = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false },
})

const { data: lista, error: eL } = await adm.rpc('listar_relaciones')
if (eL) { console.error('FALLO listando:', eL.message); process.exit(1) }

const filas = {}
const desconocidas = []
let hechas = 0

for (const r of lista ?? []) {
  try {
    const { count, error } = await adm
      .from(r.relacion).select('*', { count: 'exact', head: true })
    if (error) throw new Error(error.message)
    filas[r.relacion] = count ?? 0
  } catch {
    // No se pudo contar: desconocida. El auditor la trata como GRANDE — lo
    // que no se sabe evaluar no pasa de largo.
    filas[r.relacion] = -1
    desconocidas.push(r.relacion)
  }
  hechas++
  if (hechas % 40 === 0) process.stdout.write(`  ${hechas} de ${lista.length}\n`)
}

writeFileSync('scripts/conteo-relaciones.json', JSON.stringify({
  contado_at: new Date().toISOString().slice(0, 10),
  relaciones: filas,
  desconocidas,
}, null, 1) + '\n')

const grandes = Object.entries(filas).filter(([, n]) => n > 1000 || n < 0)
console.log(`${Object.keys(filas).length} relaciones contadas`)
console.log(`  ${grandes.length} que pueden pasar las 1000 filas`)
console.log(`  ${desconocidas.length} que no se pudieron contar${desconocidas.length ? `: ${desconocidas.join(', ')}` : ''}`)
