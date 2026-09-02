/**
 * LAS CUATRO FECHAS QUE EL MAESTRO TRAÍA Y NORA PERDIÓ.
 *
 * ── QUÉ PASÓ ────────────────────────────────────────────────────────────────
 *
 * `pla_3d_24.csv` trae `fec_actu`, `ult_vta`, `ult_cpa` y `fec_alta` con 42.837,
 * 14.551, 15.112 y 46.003 valores. En `sifaco_maestro_staging` las cuatro están
 * en CERO filas.
 *
 * El motivo es el mismo bug que en v0.88 se comió la fecha de fin de 329
 * ofertas: `fechaSifaco` no reconocía el formato ISO —el `\d{1,2}` del patrón no
 * podía matchear «2026»—, así que `2026-08-24` caía al `Number(t)`, daba NaN y
 * devolvía null. Se arregló para las ofertas. El maestro nunca se volvió a
 * importar, así que su mitad del bug siguió ahí.
 *
 * Esto lee el archivo y completa las fechas. No pisa nada: sólo nulos.
 *
 *   npx tsx --env-file=.env.local scripts/recuperar-fechas-del-maestro.ts
 */

import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

import { fechaSifaco } from '../lib/sifaco/columnas'

function env(n: string): string {
  const v = process.env[n]
  if (!v) throw new Error(`Falta ${n}`)
  return v
}

const adm = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false },
})

/** Parser mínimo de CSV con comillas. El archivo ya viene en UTF-8 y en ISO. */
function filasDelCsv(texto: string): string[][] {
  const filas: string[][] = []
  let campo = '', fila: string[] = [], enComillas = false
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (enComillas) {
      if (c === '"') { if (texto[i + 1] === '"') { campo += '"'; i++ } else enComillas = false }
      else campo += c
    } else if (c === '"') enComillas = true
    else if (c === ',') { fila.push(campo); campo = '' }
    else if (c === '\n') { fila.push(campo); filas.push(fila); fila = []; campo = '' }
    else if (c !== '\r') campo += c
  }
  if (campo || fila.length) { fila.push(campo); filas.push(fila) }
  return filas
}

async function main() {
  const texto = readFileSync('data/sifaco/pla_3d_24.csv', 'utf8')
  const filas = filasDelCsv(texto)
  const enc = filas[0]
  const I = Object.fromEntries(enc.map((c, i) => [c, i])) as Record<string, number>

  for (const c of ['codigo', 'ult_vta', 'ult_cpa', 'fec_alta', 'fec_actu']) {
    if (I[c] === undefined) throw new Error(`El archivo no tiene la columna ${c}`)
  }

  const out: any[] = []
  let conAlguna = 0
  for (const f of filas.slice(1)) {
    if (!f[I.codigo]?.trim()) continue
    const fila = {
      sku: f[I.codigo].trim(),
      ult_vta:  fechaSifaco(f[I.ult_vta]),
      ult_cpa:  fechaSifaco(f[I.ult_cpa]),
      fec_alta: fechaSifaco(f[I.fec_alta]),
      fec_actu: fechaSifaco(f[I.fec_actu]),
    }
    if (fila.ult_vta || fila.ult_cpa || fila.fec_alta || fila.fec_actu) conAlguna++
    out.push(fila)
  }

  console.log(`filas del archivo: ${out.length}`)
  console.log(`con al menos una fecha: ${conAlguna}`)
  console.log(`  ult_vta:  ${out.filter((x) => x.ult_vta).length}`)
  console.log(`  ult_cpa:  ${out.filter((x) => x.ult_cpa).length}`)
  console.log(`  fec_alta: ${out.filter((x) => x.fec_alta).length}`)
  console.log(`  fec_actu: ${out.filter((x) => x.fec_actu).length}`)

  let escritos = 0
  for (let i = 0; i < out.length; i += 500) {
    const { data, error } = await adm.rpc('catalogo_set_fechas', { p_filas: out.slice(i, i + 500) })
    if (error) throw error
    escritos += Number(data ?? 0)
    process.stdout.write(`  ${Math.min(i + 500, out.length)} de ${out.length}\r`)
  }
  console.log(`\nfilas actualizadas en el catalogo: ${escritos}`)
}

main().catch((e) => { console.error('FALLO:', e?.message ?? e); process.exit(1) })
