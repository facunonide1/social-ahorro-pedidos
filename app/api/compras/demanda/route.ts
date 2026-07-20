import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getSucursalActiva } from '@/lib/sucursal/server'
import type { AdminRole } from '@/lib/types/admin'
import { puede, type PermisosCustom } from '@/lib/types/permisos'
import { comparador } from '@/lib/nora/herramientas/compras'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * RADAR · Demanda invisible. registrar = cualquier admin activo (fricción mínima
 * desde el mostrador). agregar_orden / alta_producto reusan el flujo de Compras
 * (comparador→orden OS-4a, alta al catálogo) y requieren permiso compras/crear.
 */
export async function POST(req: NextRequest) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no autenticado' }, { status: 401 })
  const { data: me } = await sb.from('users_admin').select('rol, activo, permisos_custom').eq('id', user.id).maybeSingle<{ rol: AdminRole; activo: boolean; permisos_custom: PermisosCustom | null }>()
  if (!me?.activo) return NextResponse.json({ error: 'sin permiso' }, { status: 403 })

  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'body inválido' }, { status: 400 }) }
  const adm = createAdminClient()
  const accion = b?.accion ?? 'registrar'
  const puedeComprar = me.rol === 'super_admin' || puede(me.rol, me.permisos_custom ?? {}, 'compras', 'crear')

  // ── registrar (todos los roles activos) ──
  if (accion === 'registrar') {
    const texto = String(b?.texto ?? '').trim()
    if (!texto) return NextResponse.json({ error: '¿Qué te pidieron?' }, { status: 400 })
    const { sucursalId, esTodas } = getSucursalActiva()
    const { data, error } = await adm.from('demanda_invisible').insert({
      texto_pedido: texto.slice(0, 200),
      producto_id: b?.producto_id ?? null,
      sucursal_id: esTodas ? null : sucursalId,
      registrado_por: user.id,
    }).select('id').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, id: data.id })
  }

  if (!puedeComprar) return NextResponse.json({ error: 'sin permiso de compras' }, { status: 403 })

  // ── alta de producto al catálogo ──
  if (accion === 'alta_producto') {
    const nombre = String(b?.nombre ?? '').trim()
    if (!nombre) return NextResponse.json({ error: 'nombre requerido' }, { status: 400 })
    const { data, error } = await adm.from('productos_catalogo').insert({ nombre, sku: b?.sku ?? null, codigo_barras: b?.ean ?? null, activo: true }).select('id, sku, nombre').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, producto: data })
  }

  // ── agregar a orden borrador (mejor precio del comparador) ──
  if (accion === 'agregar_orden') {
    if (!b?.producto_id) return NextResponse.json({ error: 'producto requerido' }, { status: 400 })
    const top = await comparador(adm, b.producto_id)
    if (!top.length) return NextResponse.json({ error: 'No hay precios de proveedor cargados para ese producto. Cargá una lista de precios o agregalo desde el comparador.' }, { status: 400 })
    const proveedorId = top[0].proveedor_id, precio = top[0].precioFinal, rubro = 'farmacia'
    const { data: existente } = await adm.from('ordenes_compra').select('id, codigo').eq('proveedor_id', proveedorId).eq('rubro', rubro).eq('estado', 'borrador').order('created_at', { ascending: false }).limit(1).maybeSingle()
    let ordenId = existente?.id ?? null, codigo = existente?.codigo ?? null
    if (!ordenId) {
      const { data: nueva, error } = await adm.from('ordenes_compra').insert({ proveedor_id: proveedorId, rubro, estado: 'borrador', origen: 'manual', created_by: user.id }).select('id, codigo').single()
      if (error || !nueva) return NextResponse.json({ error: error?.message ?? 'no se pudo crear la orden' }, { status: 400 })
      ordenId = nueva.id; codigo = nueva.codigo
    }
    const { data: item } = await adm.from('orden_compra_items').select('id, cantidad_total').eq('orden_id', ordenId).eq('producto_id', b.producto_id).maybeSingle()
    if (item) await adm.from('orden_compra_items').update({ cantidad_total: Number(item.cantidad_total ?? 0) + 1 }).eq('id', item.id)
    else await adm.from('orden_compra_items').insert({ orden_id: ordenId, producto_id: b.producto_id, descripcion: b?.nombre ?? null, cantidad_total: 1, costo_unitario: precio })
    return NextResponse.json({ ok: true, orden_id: ordenId, codigo, proveedor: top[0].razon_social })
  }

  return NextResponse.json({ error: 'acción desconocida' }, { status: 400 })
}
