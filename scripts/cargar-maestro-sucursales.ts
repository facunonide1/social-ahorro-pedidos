/**
 * LA CARGA DEL MAESTRO ABIERTO POR SUCURSAL.
 *
 * ── QUÉ ARCHIVO ES ÉSTE ─────────────────────────────────────────────────────
 *
 * `maestro sucursales 14-10.xls`, hoja `tabla3e`. 48.127 filas × 59 columnas.
 * Es el archivo que viene pedido desde v0.88 en «lo que falta para poder
 * calcular por sucursal»: trae el stock y las ventas abiertos por los cuatro
 * locales, que el maestro anterior sólo traía consolidados.
 *
 * ── POR QUÉ ES OTRO SCRIPT Y NO EL MISMO ────────────────────────────────────
 *
 * `cargar-maestro-sifaco.ts` carga `pla_3d_24`: 68 columnas, otro orden, otros
 * nombres, encabezados con la codificación rota. Son dos layouts distintos del
 * mismo sistema, y meter los dos en una función con un `if` por tipo es la
 * forma más rápida de que una corrección en uno rompa el otro sin que nadie se
 * entere. Lo que SÍ se comparte es lo que tiene que estar igual:
 * `numeroSifaco`, `codigoSifaco` y `fechaSifaco`.
 *
 * ── LO QUE NO HACE ──────────────────────────────────────────────────────────
 *
 * No escribe en el catálogo, ni en `stock_items`, ni en las ventas. Deja las
 * filas en la pila de origen y corre las verificaciones. Aplicar es otro paso y
 * lo decide una persona, que es la regla del motor de documentos.
 *
 *   npx tsx --env-file=.env.local scripts/cargar-maestro-sucursales.ts "docs/maestro sucursales 14-10.xls"
 */

import { createHash } from 'crypto'
import { readFileSync, writeFileSync } from 'fs'
import { basename } from 'path'

import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'

import { resolverColumnas } from '../lib/sifaco/columnas-sucursales'
import { normalizarArchivoSucursales } from '../lib/sifaco/fila-sucursal'
import { verificarMaestro, veredicto } from '../lib/sifaco/verificacion'

const LOTE = 500

function env(n: string): string {
  const v = process.env[n]
  if (!v) throw new Error(`Falta ${n} en el entorno (.env.local)`)
  return v
}

async function main() {
  const ruta = process.argv[2]
  if (!ruta) throw new Error('Falta la ruta del archivo')
  const soloMirar = process.argv.includes('--solo-mirar')

  const bytes = readFileSync(ruta)
  const hash = createHash('sha256').update(bytes).digest('hex')
  const libro = XLSX.read(bytes, { type: 'buffer', raw: true, cellDates: false })
  const hoja = libro.Sheets[libro.SheetNames[0]]
  const filas = XLSX.utils.sheet_to_json<unknown[]>(hoja, {
    header: 1, raw: true, defval: null, blankrows: false,
  })

  console.log(`archivo: ${basename(ruta)}  (${(bytes.length / 1e6).toFixed(1)} MB)`)
  console.log(`hoja: ${libro.SheetNames[0]}  ·  filas: ${filas.length}`)

  // ── LAS COLUMNAS, RESUELTAS CONTRA EL ENCABEZADO REAL ─────────────────────
  const mapa = resolverColumnas(filas[0] ?? [])
  if (mapa.faltan.length) {
    console.error(`FALLA · faltan columnas obligatorias: ${mapa.faltan.join(', ')}`)
    process.exit(1)
  }
  console.log(`columnas: ${Object.keys(mapa.indice).length} resueltas por nombre` +
    `${mapa.deMas.length ? `, ${mapa.deMas.length} del archivo que no usamos` : ''}`)

  // ── A.1 · EL CSV EN UTF-8, EN data/sifaco/ ────────────────────────────────
  //
  // Se deja convertido aunque la carga vaya derecho del .xls: es el archivo que
  // permite volver a mirar qué decía sin depender de que alguien conserve el
  // Excel. Este archivo NO tiene el problema de codificación del anterior —el
  // resumen lo confirma abajo— así que no hay nada que arreglar, y eso también
  // hay que decirlo en vez de suponerlo.
  if (!soloMirar) {
    const csv = XLSX.utils.sheet_to_csv(hoja, { FS: ',', RS: '\n', blankrows: false })
    const destino = 'data/sifaco/maestro-sucursales-14-10.csv'
    writeFileSync(destino, csv, { encoding: 'utf8' })
    console.log(`csv utf-8: ${destino}  (${(Buffer.byteLength(csv) / 1e6).toFixed(1)} MB)`)
  }

  // ── NORMALIZAR, con el mismo código que usa la pantalla ───────────────────
  const { filas: normalizadas, resumen } = normalizarArchivoSucursales(filas, mapa)

  console.log(`normalizadas: ${normalizadas.length}  ·  códigos repetidos: ${resumen.duplicados.length}`)
  console.log(`fecha del archivo, del propio dato (máximo FEC_ACTU): ${resumen.fechaArchivo ?? 'no se pudo determinar'}`)
  console.log(`descripciones con la codificación rota: ${resumen.conMojibake}`)

  const adm = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  })

  // ── LA IMPORTACIÓN ANTERIOR, PARA PODER COMPARAR ──────────────────────────
  const { data: ant } = await adm.from('sifaco_importaciones')
    .select('filas_cargadas, fecha_archivo, resultado')
    .in('tipo', ['maestro', 'sucursal'])
    .not('cargado_at', 'is', null)
    .order('fecha_archivo', { ascending: false })
    .limit(1).maybeSingle()

  // ── D.2 · LAS VERIFICACIONES, ANTES DE ESCRIBIR UNA FILA ──────────────────
  const chequeos = verificarMaestro({
    encabezados: filas[0] ?? [],
    filas: resumen.filas,
    fechaArchivo: resumen.fechaArchivo,
    gruposNomGru: resumen.gruposNomGru,
    valorCosto: resumen.valorCosto,
    duplicados: resumen.duplicados,
    anterior: ant
      ? {
          filas: Number(ant.filas_cargadas ?? 0),
          valorCosto: Number((ant.resultado as any)?.valor_costo ?? 0) || null,
          fechaArchivo: ant.fecha_archivo as string | null,
        }
      : null,
  })

  console.log('\n── VERIFICACIÓN ──')
  for (const c of chequeos) {
    const m = c.nivel === 'corta' ? 'CORTA' : c.nivel === 'avisa' ? 'avisa' : '  ok '
    console.log(`  ${m}  ${c.titulo}: ${c.dice}`)
    if (c.queHacer) console.log(`        → ${c.queHacer}`)
  }
  const v = veredicto(chequeos)
  console.log(`\nveredicto: ${v.entra ? 'entra' : 'NO ENTRA'} · ${v.cortes} cortes · ${v.avisos} avisos`)

  if (soloMirar) return
  if (!v.entra) { console.error('FALLA · el archivo no entra. No se escribió nada.'); process.exit(1) }

  // ── ABRIR LA IMPORTACIÓN Y SUBIR LA PILA ──────────────────────────────────
  const { data: ya } = await adm.from('sifaco_importaciones')
    .select('id, estado, filas_cargadas').eq('archivo_hash', hash).maybeSingle()

  let impId: string
  if (ya) {
    impId = ya.id
    console.log(`\nesta importación ya existía (${impId}): se vuelve a cargar la pila`)
    await adm.from('sifaco_sucursal_staging').delete().eq('importacion_id', impId)
  } else {
    const { data: imp, error } = await adm.from('sifaco_importaciones').insert({
      tipo: 'sucursal',
      archivo_nombre: basename(ruta),
      archivo_hash: hash,
      bytes: bytes.length,
      estado: 'cargando',
      codificacion: 'utf-8',
      filas_declaradas: normalizadas.length,
      fecha_archivo: resumen.fechaArchivo,
      verificacion: chequeos as any,
    }).select('id').single()
    if (error) throw error
    impId = imp.id
  }

  for (let i = 0; i < normalizadas.length; i += LOTE) {
    const tanda = normalizadas.slice(i, i + LOTE).map((f) => ({ ...f, importacion_id: impId }))
    const { error } = await adm.from('sifaco_sucursal_staging').insert(tanda)
    if (error) throw new Error(`lote en la fila ${i}: ${error.message}`)
    if ((i / LOTE) % 20 === 0) process.stdout.write(`  ${i + tanda.length} de ${normalizadas.length}\n`)
  }

  await adm.from('sifaco_importaciones').update({
    estado: 'cargado',
    filas_cargadas: normalizadas.length,
    cargado_at: new Date().toISOString(),
    verificacion: chequeos as any,
    resultado: {
      valor_costo: Math.round(resumen.valorCosto),
      duplicados: resumen.duplicados,
      fecha_del_dato: resumen.fechaArchivo,
      hoja: libro.SheetNames[0],
      columnas_sin_usar: mapa.deMas,
    } as any,
  }).eq('id', impId)

  console.log(`\nimportación ${impId} · ${normalizadas.length} filas en la pila de origen`)
  console.log('NO se aplicó nada al catálogo: eso es el paso siguiente y lo mira una persona.')
}

main().catch((e) => { console.error('FALLO:', e?.message ?? e); process.exit(1) })
