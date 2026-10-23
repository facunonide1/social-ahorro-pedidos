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
 * ── Y POR QUÉ UN CONTEO QUE FALLA NO BORRA EL ANTERIOR ──────────────────────
 *
 * Porque el timeout es transitorio. `reco_compras_urgencia` es un group by
 * sobre una vista de 48.000 filas: cuenta bien casi siempre y falla cuando la
 * base está ocupada. La primera versión escribía -1 y el auditor empezaba a
 * marcar una consulta que estaba bien, con un número que no era el de la
 * tabla sino el del momento en que se corrió el script.
 *
 * Un auditor que grita distinto cada vez que se corre se deja de mirar, y la
 * salida fácil es aceptar el hallazgo — que es justamente cómo se cuela un
 * corte de verdad.
 *
 * Así que si no se puede contar ahora pero había un conteo antes, se conserva
 * el anterior y la relación se anota en `sin_recontar`. Sólo queda en -1 lo
 * que nunca se pudo contar: eso sí es «no lo puedo saber».
 *
 *   npm run contar:relaciones
 */
import { writeFileSync, readFileSync, existsSync } from 'fs'
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

const ARCHIVO = 'scripts/conteo-relaciones.json'
const previo = existsSync(ARCHIVO)
  ? JSON.parse(readFileSync(ARCHIVO, 'utf8')).relaciones ?? {}
  : {}

const filas = {}
const desconocidas = []
const sinRecontar = []
let hechas = 0

for (const r of lista ?? []) {
  let contado = null
  // Dos intentos: el primer timeout de una vista cara suele ser la base
  // ocupada, no la vista.
  for (let intento = 0; intento < 2 && contado === null; intento++) {
    try {
      const { count, error } = await adm
        .from(r.relacion).select('*', { count: 'exact', head: true })
      if (error) throw new Error(error.message)
      contado = count ?? 0
    } catch { /* se reintenta una vez */ }
  }

  if (contado !== null) {
    filas[r.relacion] = contado
  } else if (typeof previo[r.relacion] === 'number' && previo[r.relacion] >= 0) {
    // No se pudo ahora, pero se pudo antes. El conteo de antes sigue siendo
    // mejor informacion que «no se sabe».
    filas[r.relacion] = previo[r.relacion]
    sinRecontar.push(r.relacion)
  } else {
    // Nunca se pudo contar. El auditor la trata como GRANDE — lo que no se
    // sabe evaluar no pasa de largo.
    filas[r.relacion] = -1
    desconocidas.push(r.relacion)
  }
  hechas++
  if (hechas % 40 === 0) process.stdout.write(`  ${hechas} de ${lista.length}\n`)
}

writeFileSync(ARCHIVO, JSON.stringify({
  contado_at: new Date().toISOString().slice(0, 10),
  relaciones: filas,
  desconocidas,
  // Las que conservan el conteo anterior porque no se pudieron recontar hoy.
  // No es lo mismo que desconocida: hay numero, es de antes.
  sin_recontar: sinRecontar,
}, null, 1) + '\n')

const grandes = Object.entries(filas).filter(([, n]) => n > 1000 || n < 0)
console.log(`${Object.keys(filas).length} relaciones contadas`)
console.log(`  ${grandes.length} que pueden pasar las 1000 filas`)
console.log(`  ${desconocidas.length} que nunca se pudieron contar${desconocidas.length ? `: ${desconocidas.join(', ')}` : ''}`)
if (sinRecontar.length) {
  console.log(`  ${sinRecontar.length} conservan el conteo anterior: ${sinRecontar.join(', ')}`)
}
