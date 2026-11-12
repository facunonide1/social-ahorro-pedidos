import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isCronRequest } from '@/lib/cron/auth'
import { conRegistro } from '@/lib/cron/corrida'
import { automatizacionActiva } from '@/lib/os/definicion'
import { puedeCalcular } from '@/lib/demo/guarda-calculo'
import type { AdminRole } from '@/lib/types/admin'

import { enTandas } from '@/lib/supabase/tandas'
import {
  filtrarRango, paginarConPlazo, Plazo, PlazoVencido, rangoDeTramo, tramoDeLaCorrida,
  PLAZO_ESCRITURA_MS, TRAMOS_POR_DEFECTO,
} from '@/lib/cron/tramos'
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Recalcula producto_rotacion desde movimientos `venta` (OPS · T6).
 * GET: cron (cron-secret). POST: super_admin manual.
 *  - venta_diaria_prom 7d/30d, dias_stock_restante, fecha_quiebre_estimada,
 *  - ultima_venta, clasificacion_abc (por facturación: A=top 20% items, B=30%, C=resto).
 */
async function get(req: NextRequest) {
  if (!isCronRequest(req)) return NextResponse.json({ error: 'sin_secret' }, { status: 401 })
  // La declaración de la fábrica puede apagarla. Fallback `true`: lo que hace el
  // código. Un cron que corre de más se nota; uno que no corre, no.
  //
  // EN EL GET Y NO EN run(): en v0.74 estaba adentro de run(), que es el mismo
  // que llama el POST manual de super_admin. O sea que apagar la automatización
  // apagaba también el botón de una persona, y eso es gobernar una acción — que
  // no es lo que se declaró ni lo que la fábrica puede hacer hoy.
  if (!(await automatizacionActiva('stock', 'recalcular_rotacion', true))) {
    return NextResponse.json({ ok: true, omitida: 'la declaración la tiene apagada' })
  }

  // Y aunque esté encendida, no calcula sobre datos de demostración: el número
  // que produce se GUARDA, y un histórico falso no se nota después (v0.81).
  // La condición se evalúa acá y no en run(): el POST de abajo es una persona
  // apretando un botón, y eso ya es una decisión tomada.
  const g = await puedeCalcular('metricas-stock')
  if (!g.puede) return NextResponse.json({ ok: true, omitida: g.motivo })
  return run(tramoDeLaCorrida(new URL(req.url), new Date(), TRAMOS_POR_DEFECTO))
}
export async function POST(req: NextRequest) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no autenticado' }, { status: 401 })
  const { data: me } = await sb.from('users_admin').select('rol, activo').eq('id', user.id)
    .maybeSingle<{ rol: AdminRole; activo: boolean }>()
  if (!me || !me.activo || !['super_admin', 'gerente'].includes(me.rol)) {
    return NextResponse.json({ error: 'requiere super_admin/gerente' }, { status: 403 })
  }
  // Un tramo por clic (el de `?tramo=` o el que toca por reloj): los seis
  // seguidos no entran en 60 s.
  return run(tramoDeLaCorrida(new URL(req.url), new Date(), TRAMOS_POR_DEFECTO))
}

async function run(tramo: number) {
  const n = TRAMOS_POR_DEFECTO
  try {
    return await calcular(tramo, n)
  } catch (e) {
    // Plazo de lectura vencido: no se escribió nada de este tramo; la
    // rotación guardada sigue como estaba y la próxima pasada lo retoma.
    if (e instanceof PlazoVencido) {
      return NextResponse.json({ ok: false, pendiente: true, tramo, de: n, error: e.message }, { status: 503 })
    }
    throw e
  }
}

async function calcular(tramo: number, n: number) {
  const adm = createAdminClient()
  const ahora = Date.now()
  const d30 = new Date(ahora - 30 * 86_400_000).toISOString()
  const d7 = new Date(ahora - 7 * 86_400_000).toISOString()
  const hoy = new Date().toISOString().slice(0, 10)
  const rango = rangoDeTramo(tramo, n)
  const plazo = new Plazo()

  // Sólo los productos del tramo, en todas las sucursales. La rotación se
  // calcula sobre TODOS los movimientos del período para esos productos
  // (cortada en mil, el promedio salía por una fracción y quedaba guardado,
  // v0.85). `id` de desempate en el orden.
  const [ventas, stock, prods] = await Promise.all([
    paginarConPlazo<any>(filtrarRango(adm.from('movimientos_stock').select('id, producto_id, sucursal_id, cantidad, fecha').eq('tipo', 'venta').gte('fecha', d30), 'producto_id', rango).order('id'), 'movimientos_stock', plazo),
    paginarConPlazo<any>(filtrarRango(adm.from('stock_items').select('producto_id, sucursal_id, cantidad'), 'producto_id', rango).order('id'), 'stock_items', plazo),
    paginarConPlazo<any>(filtrarRango(adm.from('productos_catalogo').select('id, precio_sugerido, precio_costo_promedio').eq('activo', true).eq('es_demo', false), 'id', rango).order('id'), 'productos_catalogo', plazo),
  ])
  plazo.exigir(40_000, 'lectura del tramo')

  const precio = new Map<string, number>(((prods ?? []) as any[]).map((p) => [p.id, Number(p.precio_sugerido ?? p.precio_costo_promedio ?? 0)]))

  type Agg = { u7: number; u30: number; ultima: string | null }
  const ventaAgg = new Map<string, Agg>()
  const key = (p: string, s: string) => `${p}|${s}`
  for (const v of (ventas ?? []) as any[]) {
    const u = Math.abs(Number(v.cantidad))
    const k = key(v.producto_id, v.sucursal_id)
    const a = ventaAgg.get(k) ?? { u7: 0, u30: 0, ultima: null }
    a.u30 += u
    if (v.fecha >= d7) a.u7 += u
    if (!a.ultima || v.fecha > a.ultima) a.ultima = v.fecha
    ventaAgg.set(k, a)
  }

  const stockMap = new Map<string, number>(((stock ?? []) as any[]).map((s) => [key(s.producto_id, s.sucursal_id), Number(s.cantidad)]))

  // Facturación 30d por producto (consolidado) para ABC por item.
  //
  // El ranking es DENTRO DEL TRAMO. Los UUID son aleatorios, así que cada tramo
  // es una muestra al azar de ~1/6 del catálogo y los cortes de 20 % y 50 %
  // salen casi iguales que sobre la cadena entera; un producto que está justo
  // en el borde puede caer en la letra vecina. Es una aproximación, a cambio
  // de que la corrida entre en 60 s.
  const factPorProd = new Map<string, number>()
  for (const [k, a] of ventaAgg) {
    const [p] = k.split('|')
    factPorProd.set(p, (factPorProd.get(p) ?? 0) + a.u30 * (precio.get(p) ?? 0))
  }
  const ranking = [...factPorProd.entries()].filter(([, f]) => f > 0).sort((a, b) => b[1] - a[1])
  const abc = new Map<string, string>()
  ranking.forEach(([p], i) => {
    const pct = (i + 1) / ranking.length
    abc.set(p, pct <= 0.2 ? 'A' : pct <= 0.5 ? 'B' : 'C')
  })

  // Filas: unión de claves con stock o ventas
  const claves = new Set<string>([...stockMap.keys(), ...ventaAgg.keys()])
  const rows = [...claves].map((k) => {
    const [producto_id, sucursal_id] = k.split('|')
    const a = ventaAgg.get(k) ?? { u7: 0, u30: 0, ultima: null }
    const v7 = Math.round((a.u7 / 7) * 100) / 100
    const v30 = Math.round((a.u30 / 30) * 100) / 100
    const cant = stockMap.get(k) ?? 0
    const dias = v30 > 0 ? Math.round((cant / v30) * 10) / 10 : null
    const quiebre = dias != null ? new Date(ahora + dias * 86_400_000).toISOString().slice(0, 10) : null
    return {
      producto_id, sucursal_id,
      venta_diaria_prom_7d: v7, venta_diaria_prom_30d: v30,
      dias_stock_restante: dias, fecha_quiebre_estimada: quiebre,
      clasificacion_abc: abc.get(producto_id) ?? null,
      ultima_venta: a.ultima ? a.ultima.slice(0, 10) : null,
      updated_at: new Date().toISOString(),
    }
  })

  // En tandas y leyendo el error: antes era un upsert único de todas las filas,
  // sin mirar si había entrado. Upsert es idempotente: si el plazo de
  // escritura se pasa entre tandas, lo que quedó sin tocar sigue con el valor
  // de ayer y la próxima pasada del tramo lo completa.
  let escritas = 0
  let cortada = false
  for (const grupo of enTandas(rows, 500)) {
    if (!plazo.queda(PLAZO_ESCRITURA_MS)) { cortada = true; break }
    const { error } = await adm.from('producto_rotacion').upsert(grupo, { onConflict: 'producto_id,sucursal_id' })
    if (error) throw new Error(`no se pudo actualizar producto_rotacion (llevaba ${escritas}): ${error.message}`)
    escritas += grupo.length
  }
  return NextResponse.json({
    ok: !cortada, fecha: hoy, tramo, de: n, filas: rows.length, escritas,
    ...(cortada ? { pendiente: true, error: 'se pasó el plazo de escritura; la próxima pasada del tramo sigue' } : {}),
  }, { status: cortada ? 503 : 200 })
}

export const GET = conRegistro('metricas-stock', get)
