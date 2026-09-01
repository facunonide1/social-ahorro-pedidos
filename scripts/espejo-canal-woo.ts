/**
 * EL ESPEJO DE LO QUE HAY PUBLICADO EN LA TIENDA.
 *
 * ── POR QUÉ LEER ANTES DE ESCRIBIR ──────────────────────────────────────────
 *
 * «Se vende casi todo» hay que verificarlo contra la tienda, no suponerlo. Lo
 * primero es saber qué está arriba: cuántos productos, con qué precio, con qué
 * stock, y —lo más importante— **cuántos no deberían estar publicados**.
 *
 * Este script SOLO LEE. No despublica, no corrige precios, no toca nada allá.
 * Despublicar cosas sin avisar es peor que dejarlas.
 *
 *   npx tsx scripts/espejo-canal-woo.ts
 */

import { createClient } from '@supabase/supabase-js'

function env(n: string): string {
  const v = process.env[n]
  if (!v) throw new Error(`Falta ${n}`)
  return v
}

const adm = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false },
})

const BASE = env('WOOCOMMERCE_URL').replace(/\/$/, '')
const AUTH = 'Basic ' + Buffer.from(
  `${env('WOOCOMMERCE_CONSUMER_KEY')}:${env('WOOCOMMERCE_CONSUMER_SECRET')}`,
).toString('base64')

type WooProd = {
  id: number; sku?: string; name?: string; price?: string; regular_price?: string
  stock_quantity?: number | null; manage_stock?: boolean; status?: string
  permalink?: string; meta_data?: { key: string; value: unknown }[]
}

/** El código de barras puede venir como meta o dentro del nombre. */
function barrasDe(p: WooProd): string | null {
  for (const m of p.meta_data ?? []) {
    if (/barcode|ean|codigo_barra|_barras/i.test(m.key)) {
      const v = String(m.value ?? '').trim()
      if (/^\d{6,14}$/.test(v)) return v
    }
  }
  const enNombre = (p.name ?? '').match(/\b(\d{13})\b/)
  return enNombre ? enNombre[1] : null
}

async function paginaDeProductos(page: number): Promise<{ filas: WooProd[]; total: number }> {
  const url = `${BASE}/wp-json/wc/v3/products?per_page=100&page=${page}&status=any`
  const r = await fetch(url, { headers: { Authorization: AUTH, Accept: 'application/json' } })
  if (!r.ok) throw new Error(`Woo ${r.status}: ${(await r.text()).slice(0, 200)}`)
  return { filas: await r.json(), total: Number(r.headers.get('x-wp-total') ?? 0) }
}

async function main() {
  console.log(`tienda: ${BASE}`)
  const filas: any[] = []
  let total = 0

  for (let page = 1; page <= 200; page++) {
    const { filas: tanda, total: t } = await paginaDeProductos(page)
    if (page === 1) { total = t; console.log(`productos publicados: ${total}`) }
    if (!tanda.length) break
    for (const p of tanda) {
      filas.push({
        canal_id: 'woo',
        externo_id: String(p.id),
        sku: (p.sku ?? '').trim() || null,
        barras: barrasDe(p),
        nombre: p.name ?? null,
        precio: p.price ? Number(p.price) : (p.regular_price ? Number(p.regular_price) : null),
        stock: p.stock_quantity ?? null,
        gestiona_stock: !!p.manage_stock,
        estado: p.status ?? null,
        permalink: p.permalink ?? null,
      })
    }
    if (page % 10 === 0) process.stdout.write(`  ${filas.length} de ${total}\n`)
    if (filas.length >= total) break
  }
  console.log(`leidos: ${filas.length}`)

  for (let i = 0; i < filas.length; i += 500) {
    const { error } = await adm.from('canal_publicaciones')
      .upsert(filas.slice(i, i + 500), { onConflict: 'canal_id,externo_id' })
    if (error) throw error
  }

  // El cruce va EN LA BASE: 7.737 publicaciones contra 46.009 productos no se
  // cruzan en memoria (docs/CONSULTAS-QUE-NO-MIENTEN.md).
  const { data: cruce, error } = await adm.rpc('canal_cruzar_catalogo', { p_canal: 'woo' })
  if (error) throw error
  console.log('\ncruce contra el catalogo:')
  console.log(JSON.stringify(cruce, null, 1))
}

main().catch((e) => { console.error('FALLO:', e?.message ?? e); process.exit(1) })
