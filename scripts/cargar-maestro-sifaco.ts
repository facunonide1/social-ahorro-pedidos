/**
 * LA CARGA INICIAL DEL MAESTRO, DESDE UNA TERMINAL.
 *
 * ── POR QUÉ EXISTE, SI YA HAY UNA PANTALLA ──────────────────────────────────
 *
 * La pantalla es para todas las veces que siguen: alguien exporta de SIFACO y
 * lo sube. Ésta es la primera, y la primera es distinta: el archivo ya está en
 * el repo, convertido a CSV, y hay que cargarlo una vez para que el sistema
 * deje de estar vacío.
 *
 * Comparte TODO con la pantalla salvo el transporte: la misma
 * `normalizarFila`, el mismo mapa de columnas, las mismas conversiones. Si esto
 * fuera un normalizador aparte, en la tercera corrección habría dos catálogos
 * distintos y ninguno sería el bueno.
 *
 * ── LO QUE NO HACE ──────────────────────────────────────────────────────────
 *
 * No escribe en `productos_catalogo` ni toca `stock_items`. Deja las filas en la
 * pila de origen y calcula la vista previa. Aplicar es otro paso, y lo mira una
 * persona.
 *
 *   npx tsx scripts/cargar-maestro-sifaco.ts data/sifaco/pla_3d_24.csv
 */

import { createHash } from 'crypto'
import { readFileSync } from 'fs'
import { basename } from 'path'

import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'

import { detectarCodificacion } from '../lib/sifaco/codificacion'
import { FILA_PRIMER_DATO } from '../lib/sifaco/columnas'
import { normalizarFila, type Fila } from '../lib/sifaco/fila'

const LOTE = 500

function env(n: string): string {
  const v = process.env[n]
  if (!v) throw new Error(`Falta ${n} en el entorno (.env.local)`)
  return v
}

async function main() {
  const ruta = process.argv[2]
  if (!ruta) throw new Error('Uso: cargar-maestro-sifaco.ts <archivo.csv>')

  const adm = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  })

  const buf = readFileSync(ruta)
  const hash = createHash('sha256').update(buf).digest('hex')
  console.log(`archivo: ${basename(ruta)}  ${(buf.length / 1_048_576).toFixed(1)} MB`)
  console.log(`sha256:  ${hash}`)

  // Misma idempotencia que la pantalla: el hash decide.
  const { data: ya } = await adm
    .from('sifaco_importaciones')
    .select('id, estado, filas_cargadas')
    .eq('archivo_hash', hash)
    .maybeSingle()

  let importacionId: string
  if (ya) {
    console.log(`\nya existe una importación de este archivo: ${ya.id} (${ya.estado}, ${ya.filas_cargadas} filas)`)
    console.log('se retoma desde donde quedó.')
    importacionId = ya.id
  } else {
    const { data, error } = await adm.from('sifaco_importaciones').insert({
      tipo: 'maestro',
      archivo_nombre: basename(ruta),
      archivo_hash: hash,
      bytes: buf.length,
      estado: 'cargando',
    }).select('id').single()
    if (error) throw error
    importacionId = data.id
    console.log(`\nimportación nueva: ${importacionId}`)
  }

  const libro = XLSX.read(buf, { type: 'buffer', raw: true, codepage: 65001 })
  const hoja = libro.Sheets[libro.SheetNames[0]]
  const filas = XLSX.utils.sheet_to_json<unknown[]>(hoja, {
    header: 1, raw: true, defval: null, blankrows: false,
  })
  console.log(`filas en el archivo: ${filas.length} (incluye el encabezado)`)

  const muestra: string[] = []
  for (let i = FILA_PRIMER_DATO; i < filas.length && muestra.length < 3000; i++) {
    const d = filas[i]?.[0]
    if (typeof d === 'string' && d) muestra.push(d)
  }
  const veredicto = detectarCodificacion(muestra)
  console.log(`codificación: ${veredicto.codificacion} — puntajes ${JSON.stringify(veredicto.puntajes)}`)
  console.log(`residuo: ${veredicto.residuo.filas} textos con caracteres imposibles`)

  const normalizadas: Fila[] = []
  for (let i = FILA_PRIMER_DATO; i < filas.length; i++) {
    const f = filas[i]
    if (!f) continue
    const n = normalizarFila(f, i, veredicto.codificacion)
    if (n) normalizadas.push(n)
  }
  console.log(`filas de datos normalizadas: ${normalizadas.length}`)

  const { data: hechos } = await adm
    .from('sifaco_import_lotes').select('lote').eq('importacion_id', importacionId)
  const yaEstan = new Set((hechos ?? []).map((r: any) => r.lote))

  const lotes = Math.ceil(normalizadas.length / LOTE)
  const t0 = Date.now()

  for (let l = 0; l < lotes; l++) {
    if (yaEstan.has(l)) continue
    const tanda = normalizadas.slice(l * LOTE, l * LOTE + LOTE)
      .map((f) => ({ ...f, importacion_id: importacionId }))

    const { error } = await adm.from('sifaco_maestro_staging')
      .upsert(tanda, { onConflict: 'importacion_id,fila' })
    if (error) {
      await adm.from('sifaco_importaciones')
        .update({ estado: 'error', error: `lote ${l}: ${error.message}` })
        .eq('id', importacionId)
      throw new Error(`lote ${l}: ${error.message}`)
    }

    await adm.from('sifaco_import_lotes').upsert({
      importacion_id: importacionId, lote: l,
      desde_fila: (tanda[0] as any)?.fila ?? l * LOTE, filas: tanda.length,
    }, { onConflict: 'importacion_id,lote' })

    if ((l + 1) % 10 === 0 || l === lotes - 1) {
      const s = (Date.now() - t0) / 1000
      process.stdout.write(`  lote ${l + 1}/${lotes} · ${s.toFixed(0)}s\n`)
    }
  }

  const { count } = await adm
    .from('sifaco_maestro_staging')
    .select('fila', { count: 'exact', head: true })
    .eq('importacion_id', importacionId)

  await adm.from('sifaco_importaciones').update({
    estado: 'cargado',
    filas_cargadas: count ?? 0,
    filas_declaradas: normalizadas.length,
    codificacion: veredicto.codificacion,
    codificacion_prueba: veredicto as any,
    cargado_at: new Date().toISOString(),
  }).eq('id', importacionId)

  const segundos = (Date.now() - t0) / 1000
  console.log(`\ncargadas ${count} filas en ${segundos.toFixed(0)}s`)

  const { data: previa, error: ePrevia } = await adm
    .rpc('sifaco_previa_maestro', { p_importacion: importacionId })
  if (ePrevia) throw ePrevia

  await adm.from('sifaco_importaciones').update({ previa }).eq('id', importacionId)
  console.log('\n── vista previa ──')
  console.log(JSON.stringify(previa, null, 1))
  console.log(`\nimportación: ${importacionId}`)
}

main().catch((e) => { console.error('\nFALLÓ:', e.message ?? e); process.exit(1) })
