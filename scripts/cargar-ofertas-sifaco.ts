/**
 * LA CARGA DEL ARCHIVO DE OFERTAS.
 *
 * Reusa el motor de v0.83: hash para idempotencia, registro de la importación,
 * tandas. Y agrega lo que pedía esta sesión: las tres verificaciones previas,
 * el mapeo de columnas recordado, y la forma del descuento guardada aparte del
 * número.
 *
 * No escribe hacia SIFACO ni toca precios: `ofertas_sifaco` es un espejo.
 *
 *   npx tsx scripts/cargar-ofertas-sifaco.ts data/sifaco/ofertas_24-8.csv
 */

import { createHash } from 'crypto'
import { readFileSync } from 'fs'
import { basename } from 'path'

import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'

import { leerOferta, huellaDeEncabezados, type Indice, type FormaDescuento, type CondicionVenta } from '../lib/sifaco/ofertas'

const LOTE = 500

function env(n: string): string {
  const v = process.env[n]
  if (!v) throw new Error(`Falta ${n}`)
  return v
}

async function main() {
  const ruta = process.argv[2]
  const forzar = process.argv.includes('--forzar')
  const adm = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  })

  const buf = readFileSync(ruta)
  const hash = createHash('sha256').update(buf).digest('hex')
  console.log(`archivo: ${basename(ruta)}  ${(buf.length / 1_048_576).toFixed(1)} MB`)

  const libro = XLSX.read(buf, { type: 'buffer', raw: true, codepage: 65001 })
  const filas = XLSX.utils.sheet_to_json<unknown[]>(libro.Sheets[libro.SheetNames[0]], {
    header: 1, raw: true, defval: null, blankrows: false,
  })
  const enc = (filas[0] ?? []).map((x) => String(x ?? '').trim())
  const datos = filas.slice(1)
  const I: Indice = Object.fromEntries(enc.map((c, i) => [c, i]))
  const huella = huellaDeEncabezados(enc)
  console.log(`filas: ${datos.length} · columnas: ${enc.length}`)

  // ── LAS TRES VERIFICACIONES, ANTES DE TOCAR NADA ──────────────────────────
  const fechaArchivo = (() => {
    // La fecha más nueva de `fec_actu` es la del corte del reporte.
    let max: string | null = null
    for (const f of datos) {
      const v = String(f[I.fec_actu] ?? '').trim()
      if (/^\d{4}-\d{2}-\d{2}$/.test(v) && (!max || v > max)) max = v
    }
    return max
  })()

  const { data: chequeo, error: eChequeo } = await adm.rpc('sifaco_verificar_antes', {
    p_tipo: 'ofertas', p_huella: huella, p_filas: datos.length, p_fecha: fechaArchivo,
  })
  if (eChequeo) throw eChequeo

  console.log(`\nverificaciones previas (fecha del archivo: ${fechaArchivo ?? 'sin fecha'})`)
  for (const p of (chequeo as any)?.problemas ?? []) {
    console.log(`  ${p.frena ? 'FRENA' : 'aviso'}  ${p.que}: ${p.detalle}`)
  }
  if ((chequeo as any)?.frena && !forzar) {
    console.log('\nNO SE IMPORTA. Corregí el archivo, o corré con --forzar si sabés lo que hacés.')
    process.exit(1)
  }
  if (!((chequeo as any)?.problemas ?? []).length) console.log('  las tres pasan')

  // ── El mapeo, recordado ───────────────────────────────────────────────────
  const { data: mapeoPrevio } = await adm
    .from('sifaco_mapeo_columnas').select('version, huella')
    .eq('tipo', 'ofertas').order('version', { ascending: false }).limit(1)

  if (!mapeoPrevio?.length || (mapeoPrevio[0] as any).huella !== huella) {
    const version = (mapeoPrevio?.[0] as any)?.version ? Number((mapeoPrevio![0] as any).version) + 1 : 1
    await adm.from('sifaco_mapeo_columnas').insert({
      tipo: 'ofertas', version, huella, columnas: I, filas_tipicas: datos.length,
    })
    console.log(`mapeo de columnas guardado (version ${version}): la proxima vez se reconoce solo`)
  } else {
    console.log('archivo reconocido: mismo mapeo de columnas que la vez anterior')
  }

  // ── La importación ────────────────────────────────────────────────────────
  const { data: ya } = await adm
    .from('sifaco_importaciones').select('id, estado').eq('archivo_hash', hash).maybeSingle()

  let impId: string
  if (ya) {
    console.log(`\nya existe una importacion de este archivo: ${ya.id} — se retoma`)
    impId = ya.id
  } else {
    const { data, error } = await adm.from('sifaco_importaciones').insert({
      tipo: 'ofertas', archivo_nombre: basename(ruta), archivo_hash: hash,
      bytes: buf.length, estado: 'cargando', codificacion: 'utf8-ya-convertido',
      fecha_archivo: fechaArchivo,
    }).select('id').single()
    if (error) throw error
    impId = data.id
    console.log(`\nimportacion nueva: ${impId}`)
  }

  const [{ data: fRows }, { data: cRows }] = await Promise.all([
    adm.from('sifaco_forma_descuento').select('*'),
    adm.from('sifaco_condicion_venta').select('*'),
  ])
  const formas = new Map<string, FormaDescuento>((fRows ?? []).map((f: any) => [f.tip_sifaco, f]))
  const condiciones = new Map<string, CondicionVenta>((cRows ?? []).map((c: any) => [c.vl_sifaco, c]))

  const sinDeclarar = { formas: new Set<string>(), condiciones: new Set<string>() }
  const hoy = new Date().toISOString().slice(0, 10)
  const ofertas: any[] = []
  for (const f of datos) {
    const tip = String(f[I.tip_o1] ?? '').trim()
    const vl = String(f[I.vl] ?? '').trim()
    if (!formas.has(tip)) sinDeclarar.formas.add(tip)
    if (!condiciones.has(vl)) sinDeclarar.condiciones.add(vl)
    const o = leerOferta(f, I, formas, condiciones, hoy)
    if (o) ofertas.push({ ...o, importacion_id: impId })
  }

  if (sinDeclarar.formas.size || sinDeclarar.condiciones.size) {
    console.log('\nSIN DECLARAR — no se interpretan:')
    if (sinDeclarar.formas.size) console.log('  formas de descuento:', [...sinDeclarar.formas])
    if (sinDeclarar.condiciones.size) console.log('  condiciones de venta:', [...sinDeclarar.condiciones])
  }

  // Los codigos repetidos NO entran, igual que en el maestro (v0.83). En este
  // archivo hay uno: el 5836711, que es FABOGESIC COMPLEX y FLEXIPLEN COMPLEX
  // a la vez — dos productos distintos con el mismo codigo en SIFACO, con
  // precios y descuentos distintos. Elegir uno le pone al otro una oferta que
  // no es la suya. Se omiten los dos y se reportan; se corrige en SIFACO.
  const vistos = new Map<string, number>()
  for (const o of ofertas) vistos.set(o.codigo, (vistos.get(o.codigo) ?? 0) + 1)
  const repetidos = [...vistos.entries()].filter(([, k]) => k > 1).map(([c]) => c)
  const limpias = ofertas.filter((o) => !repetidos.includes(o.codigo))
  if (repetidos.length) {
    console.log(`\ncodigos repetidos, OMITIDOS: ${repetidos.length} (${repetidos.join(', ')})`)
  }

  console.log(`\nofertas con descuento: ${ofertas.length} · se cargan ${limpias.length}`)
  const aCargar = limpias
  for (let i = 0; i < aCargar.length; i += LOTE) {
    const { error } = await adm.from('ofertas_sifaco')
      .upsert(aCargar.slice(i, i + LOTE), { onConflict: 'importacion_id,codigo' })
    if (error) throw error
  }

  // El cruce contra el catálogo, en la base — 16.383 × 46.009 no se cruza en
  // memoria (docs/CONSULTAS-QUE-NO-MIENTEN.md).
  const { data: cruce, error: eCruce } = await adm.rpc('ofertas_cruzar_catalogo', { p_importacion: impId })
  if (eCruce) throw eCruce

  await adm.from('sifaco_importaciones').update({
    estado: 'cargado', filas_cargadas: aCargar.length, filas_declaradas: datos.length,
    fecha_archivo: fechaArchivo,
    cargado_at: new Date().toISOString(), resultado: cruce as any,
  }).eq('id', impId)

  console.log('\ncruce contra el catalogo:', JSON.stringify(cruce, null, 1))
  console.log(`\nimportacion: ${impId}`)
}

main().catch((e) => { console.error('FALLO:', e.message ?? e); process.exit(1) })
