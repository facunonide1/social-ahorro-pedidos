/**
 * LA CONDICIÓN DE VENTA DE TODO EL CATÁLOGO.
 *
 * El archivo de ofertas trae `vl` para las 16.383 filas, no sólo para las 6.463
 * con descuento. En v0.84 sólo se cargaron las que tenían descuento, así que
 * `canal_abierto` quedó en NULL para el resto — y la regla «ofertas que faltan»
 * no podía proponer nada, porque ante la duda no se ofrece (regla de oro 9).
 *
 * Esto completa el dato. No inventa nada: es el `vl` que ya venía en el archivo.
 *
 *   npx tsx scripts/cargar-condicion-venta.ts data/sifaco/ofertas_24-8.csv
 */
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'
import { codigoSifaco } from '../lib/sifaco/columnas'

function env(n: string): string { const v = process.env[n]; if (!v) throw new Error(`Falta ${n}`); return v }

async function main() {
  const adm = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })
  const libro = XLSX.read(readFileSync(process.argv[2]), { type: 'buffer', raw: true, codepage: 65001 })
  const filas = XLSX.utils.sheet_to_json<any[]>(libro.Sheets[libro.SheetNames[0]], { header: 1, raw: true, defval: null })
  const enc = (filas[0] ?? []).map((x) => String(x ?? '').trim())
  const I = Object.fromEntries(enc.map((c, i) => [c, i])) as Record<string, number>

  const { data: conds } = await adm.from('sifaco_condicion_venta').select('*')
  const porVl = new Map((conds ?? []).map((c: any) => [c.vl_sifaco, c]))

  const porCodigo = new Map<string, any>()
  for (const f of filas.slice(1)) {
    const cod = codigoSifaco(f[I.codigo])
    if (!cod || porCodigo.has(cod)) continue
    const c = porVl.get(String(f[I.vl] ?? '').trim())
    if (!c) continue
    porCodigo.set(cod, { sku: cod, condicion_venta: c.condicion, canal_abierto: c.canal_abierto })
  }
  console.log(`codigos con condicion declarada: ${porCodigo.size}`)

  const filasSql = [...porCodigo.values()]
  for (let i = 0; i < filasSql.length; i += 500) {
    const { error } = await adm.rpc('sifaco_set_condicion_venta', { p_filas: filasSql.slice(i, i + 500) })
    if (error) throw error
  }
  const { count } = await adm.from('productos_catalogo')
    .select('id', { count: 'exact', head: true }).not('canal_abierto', 'is', null)
  console.log(`productos con condicion de venta cargada: ${count}`)
}
main().catch((e) => { console.error('FALLO:', e.message ?? e); process.exit(1) })
