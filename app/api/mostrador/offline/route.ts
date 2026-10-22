import { NextResponse } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { puede, type PermisosCustom } from '@/lib/types/permisos'
import type { AdminRole } from '@/lib/types/admin'
import { paginar } from '@/lib/supabase/paginar'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * F.5 · EL SNAPSHOT PARA TRABAJAR SIN CONEXIÓN.
 *
 * ── QUÉ MANDA ───────────────────────────────────────────────────────────────
 *
 * Los productos **con stock en la sucursal del que pide**, con lo mínimo para
 * contestar en el mostrador: nombre, presentación, laboratorio, droga, código
 * de barras, precio, cuántas hay y si requiere receta.
 *
 * No manda los 48.217 del catálogo: manda los que están. Un producto sin stock
 * acá no se puede ofrecer sin conexión igual, porque lo que vendría después
 * —ver en qué otra sucursal hay— necesita el servidor.
 *
 * ── Y QUÉ NO MANDA ──────────────────────────────────────────────────────────
 *
 * El margen y el costo, nunca: F.7 vale también acá, y un snapshot en el
 * dispositivo es más fácil de mirar que una respuesta de red.
 *
 * Tampoco el stock de las otras sucursales. Guardar una copia de un stock
 * ajeno sería prometer algo que capaz ya se vendió, y sin conexión no hay
 * forma de chequearlo.
 */
export async function GET() {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no autenticado' }, { status: 401 })

  const { data: me } = await sb.from('users_admin')
    .select('rol, activo, permisos_custom, sucursal_id').eq('id', user.id)
    .maybeSingle<{ rol: AdminRole; activo: boolean; permisos_custom: PermisosCustom | null; sucursal_id: string | null }>()
  if (!me?.activo) return NextResponse.json({ error: 'usuario inactivo' }, { status: 403 })
  if (!puede(me.rol, me.permisos_custom ?? null, 'operaciones', 'ver')) {
    return NextResponse.json({ error: 'sin permiso' }, { status: 403 })
  }

  const adm = createAdminClient()
  const sucursal = me.sucursal_id
  if (!sucursal) {
    return NextResponse.json({
      error: 'No tenés una sucursal asignada. El modo sin conexión guarda el catálogo de UNA sucursal: sin eso no se sabe cuál bajar.',
    }, { status: 400 })
  }

  const { data: suc } = await adm.from('sucursales')
    .select('nombre').eq('id', sucursal).maybeSingle()

  // Los que tienen stock acá. Se pagina: son miles y PostgREST corta en 1.000
  // sin avisar.
  const { filas: stock, truncado } = await paginar<any>(
    adm.from('stock_items').select('producto_id, cantidad')
      .eq('sucursal_id', sucursal).gt('cantidad', 0).order('producto_id'),
    { maximo: 200_000 },
  )
  const porId = new Map(stock.map((s) => [s.producto_id, Number(s.cantidad)]))
  const ids = [...porId.keys()]

  const filas: any[] = []
  for (let i = 0; i < ids.length; i += 500) {
    const { data } = await adm.from('mostrador_indice')
      .select('producto_id, sku, codigo_barras, nombre, presentacion, laboratorio, droga_principal, precio, requiere_receta, es_controlado, busqueda')
      .in('producto_id', ids.slice(i, i + 500))
    for (const m of (data ?? []) as any[]) {
      // Los controlados no van al snapshot: no aparecen en la lista general y
      // sin conexión no hay forma de escanear contra el servidor para la
      // excepción. Que no estén es lo conservador.
      if (m.es_controlado) continue
      filas.push({
        producto_id: m.producto_id,
        sku: m.sku,
        codigo_barras: m.codigo_barras,
        nombre: m.nombre,
        presentacion: m.presentacion,
        laboratorio: m.laboratorio,
        droga_principal: m.droga_principal,
        precio: m.precio == null ? null : Number(m.precio),
        stock: porId.get(m.producto_id) ?? 0,
        requiere_receta: !!m.requiere_receta,
        busqueda: m.busqueda,
      })
    }
  }

  const { data: leido } = await adm.from('producto_stock_sifaco')
    .select('leido_at').eq('sucursal_id', sucursal)
    .order('leido_at', { ascending: false }).limit(1).maybeSingle()

  return NextResponse.json({
    ok: true,
    sucursal_id: sucursal,
    sucursal_nombre: (suc as any)?.nombre ?? '',
    productos: filas.length,
    stock_leido_at: (leido as any)?.leido_at ?? null,
    truncado,
    filas,
  })
}
