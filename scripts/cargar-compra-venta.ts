/**
 * LAS 43 DROGUERÍAS Y QUIÉN LE VENDE QUÉ A QUIÉN.
 *
 * compra_venta.xls es el único de los tres archivos que dice a quién se le
 * compra cada producto. Hoy NORA tiene CERO proveedores: esto desbloquea
 * Compras entero.
 *
 * ── LO QUE EL ARCHIVO NO TRAE ───────────────────────────────────────────────
 *
 * No trae CUIT, ni domicilio, ni condición de IVA. Trae el nombre corto que usa
 * SIFACO —AME, FARMASUN, LATINA— y las unidades compradas a cada uno.
 *
 * `proveedores.cuit` es NOT NULL y único, así que hay que poner algo. Va
 * `PENDIENTE-AME`, que NO se puede confundir con un CUIT: si mañana alguien
 * emite una orden de compra, el dato faltante salta a la vista en vez de
 * pasar por un número plausible. Inventar once dígitos sería peor que dejarlo
 * vacío.
 *
 *   npx tsx scripts/cargar-compra-venta.ts data/sifaco/compra_venta.csv
 */

import { readFileSync } from 'fs'

import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'

import { numeroSifaco, codigoSifaco } from '../lib/sifaco/columnas'

/** Las columnas 13..55 son droguerías. Las de los costados son datos del producto. */
const PRIMERA_DROGUERIA = 13
const ULTIMA_DROGUERIA = 55
const COL_CODIGO = 56

function env(n: string): string {
  const v = process.env[n]
  if (!v) throw new Error(`Falta ${n}`)
  return v
}

async function main() {
  const ruta = process.argv[2]
  const adm = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  })

  const libro = XLSX.read(readFileSync(ruta), { type: 'buffer', raw: true, codepage: 65001 })
  const filas = XLSX.utils.sheet_to_json<unknown[]>(libro.Sheets[libro.SheetNames[0]], {
    header: 1, raw: true, defval: null, blankrows: false,
  })
  const enc = filas[0].map((x) => String(x ?? '').trim())
  const datos = filas.slice(1)
  console.log(`filas: ${datos.length} · columnas: ${enc.length}`)

  const droguerias = enc.slice(PRIMERA_DROGUERIA, ULTIMA_DROGUERIA + 1)
  console.log(`droguerias: ${droguerias.length}`)

  // ── 1 · Los proveedores ───────────────────────────────────────────────────
  const volumen = new Map<string, number>()
  for (const f of datos) {
    for (let c = PRIMERA_DROGUERIA; c <= ULTIMA_DROGUERIA; c++) {
      const u = numeroSifaco(f[c])
      if (u && u !== 0) {
        const d = enc[c]
        volumen.set(d, (volumen.get(d) ?? 0) + u)
      }
    }
  }

  const provs = droguerias.map((d) => ({
    razon_social: d,
    nombre_comercial: d,
    cuit: `PENDIENTE-${d}`,
    es_drogueria: true,
    activo: true,
    es_demo: false,
    notas: `Alta automatica desde compra_venta de SIFACO (28-ago-2026). Unidades compradas en el periodo: ${volumen.get(d) ?? 0}. Falta CUIT, domicilio y condicion de IVA: el archivo de SIFACO no los trae.`,
  }))

  const { error: eProv } = await adm.from('proveedores').upsert(provs, { onConflict: 'cuit' })
  if (eProv) throw eProv
  console.log(`proveedores creados/actualizados: ${provs.length}`)

  const { data: enBase } = await adm
    .from('proveedores').select('id, razon_social').eq('es_drogueria', true)
  const idPorNombre = new Map((enBase ?? []).map((p: any) => [p.razon_social, p.id]))

  // ── 2 · La matriz producto × droguería ────────────────────────────────────
  // PostgREST corta en 1000 filas por respuesta, y `.limit(60000)` no lo
  // cambia: devuelve 1000 y no avisa. Con el catalogo cortado, 4.836 productos
  // parecian "no cruzan" cuando en realidad no estaban cargados en memoria.
  // Hay que paginar con .range() y verificar que el total cierre.
  const idPorSku = new Map<string, string>()
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await adm
      .from('productos_catalogo').select('id, sku').eq('es_demo', false)
      .order('sku').range(desde, desde + 999)
    if (error) throw error
    for (const p of data ?? []) idPorSku.set((p as any).sku, (p as any).id)
    if (!data || data.length < 1000) break
  }
  console.log(`catalogo en memoria: ${idPorSku.size}`)

  const filasMatriz: any[] = []
  let sinCruce = 0
  const noCruzan: string[] = []

  for (const f of datos) {
    const cod = codigoSifaco(f[COL_CODIGO])
    const pid = cod ? idPorSku.get(cod) : undefined
    if (!pid) { sinCruce++; if (noCruzan.length < 20 && cod) noCruzan.push(cod); continue }

    for (let c = PRIMERA_DROGUERIA; c <= ULTIMA_DROGUERIA; c++) {
      const u = numeroSifaco(f[c])
      if (!u || u === 0) continue
      const provId = idPorNombre.get(enc[c])
      if (!provId) continue
      filasMatriz.push({ producto_id: pid, proveedor_id: provId, unidades: u })
    }
  }
  console.log(`filas de matriz: ${filasMatriz.length} · productos sin cruce: ${sinCruce} ${noCruzan.slice(0,6)}`)

  for (let i = 0; i < filasMatriz.length; i += 1000) {
    const { error } = await adm.from('proveedor_producto')
      .upsert(filasMatriz.slice(i, i + 1000), { onConflict: 'producto_id,proveedor_id' })
    if (error) throw error
  }
  console.log('matriz cargada')

  // ── 3 · Los promedios que ya vienen calculados ────────────────────────────
  //
  // PROM_3, PROM_6 y PROM_12 son de SIFACO, no de NORA. Entran marcados como
  // tales para poder comparar el dia que NORA calcule el suyo sobre la serie.
  const proms: any[] = []
  for (const f of datos) {
    const cod = codigoSifaco(f[COL_CODIGO])
    const pid = cod ? idPorSku.get(cod) : undefined
    if (!pid) continue
    proms.push({
      producto_id: pid,
      prom_3: numeroSifaco(f[10]), prom_6: numeroSifaco(f[11]), prom_12: numeroSifaco(f[12]),
      can_vta: numeroSifaco(f[4]), can_cpa: numeroSifaco(f[5]),
    })
  }
  for (let i = 0; i < proms.length; i += 1000) {
    const { error } = await adm.from('producto_promedios_sifaco')
      .upsert(proms.slice(i, i + 1000), { onConflict: 'producto_id' })
    if (error) throw error
  }
  console.log(`promedios de SIFACO: ${proms.length}`)
}

main().catch((e) => { console.error('FALLÓ:', e.message ?? e); process.exit(1) })
