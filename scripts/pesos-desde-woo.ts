/**
 * EL PESO Y LAS MEDIDAS, DE WOO AL CATÁLOGO.
 *
 * ── POR QUÉ HACE FALTA ──────────────────────────────────────────────────────
 *
 * Para cotizar un envío por correo hay que saber cuánto pesa y cuánto mide el
 * bulto. Eso está cargado en WooCommerce y no en NORA. Este script lo trae y lo
 * cruza por SKU contra el maestro.
 *
 * ── LO QUE NO HACE ──────────────────────────────────────────────────────────
 *
 * No escribe en Woo. No inventa un peso cuando Woo no lo declara: un producto
 * sin peso queda sin peso, y la cotización lo dice. Un peso inventado es peor
 * que ninguno, porque el transporte pesa el bulto de verdad.
 *
 *   npx tsx --env-file=.env.local scripts/pesos-desde-woo.ts
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
  id: number; sku?: string; weight?: string
  dimensions?: { length?: string; width?: string; height?: string }
}

function num(s: unknown): number | null {
  const n = Number(String(s ?? '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}

async function main() {
  const porSku = new Map<string, { peso: number | null; l: number | null; a: number | null; h: number | null }>()
  let leidos = 0

  for (let page = 1; page <= 200; page++) {
    const r = await fetch(
      `${BASE}/wp-json/wc/v3/products?per_page=100&page=${page}&status=any&_fields=id,sku,weight,dimensions`,
      { headers: { Authorization: AUTH, Accept: 'application/json' } },
    )
    if (!r.ok) throw new Error(`Woo ${r.status}: ${(await r.text()).slice(0, 200)}`)
    const tanda: WooProd[] = await r.json()
    if (!tanda.length) break
    for (const p of tanda) {
      leidos++
      const sku = (p.sku ?? '').trim()
      if (!sku) continue
      // Woo declara el peso en kilos.
      const kg = num(p.weight)
      porSku.set(sku, {
        peso: kg === null ? null : kg * 1000,
        l: num(p.dimensions?.length),
        a: num(p.dimensions?.width),
        h: num(p.dimensions?.height),
      })
    }
  }
  console.log(`leidos de woo: ${leidos} · con SKU: ${porSku.size}`)

  const conPeso = [...porSku.entries()].filter(([, v]) => v.peso !== null)
  console.log(`con peso declarado: ${conPeso.length}`)

  // De a 500 y en UNA sentencia por tanda: un update por SKU son 7.000 viajes
  // de ida y vuelta y el script no termina nunca.
  let escritos = 0
  for (let i = 0; i < conPeso.length; i += 500) {
    const filas = conPeso.slice(i, i + 500).map(([sku, v]) => ({ sku, peso: v.peso, l: v.l, a: v.a, h: v.h }))
    const { data, error } = await adm.rpc('catalogo_set_medidas', { p_filas: filas })
    if (error) throw error
    escritos += Number(data ?? 0)
    process.stdout.write(`  ${Math.min(i + 500, conPeso.length)} de ${conPeso.length}\r`)
  }

  console.log(`\nactualizados en el catalogo: ${escritos}`)
  console.log(`sin cruce contra el maestro: ${conPeso.length - escritos}`)
}

main().catch((e) => { console.error('FALLO:', e?.message ?? e); process.exit(1) })
