import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { pedirCorreccionDeStock } from '@/lib/conteo/pedir-correccion'
import type { AdminRole } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * PEDIR UNA CORRECCIÓN DE STOCK. Ya no ajusta.
 *
 * ── QUÉ HACÍA ANTES, Y POR QUÉ SE FUE ──────────────────────────────────────
 *
 * Hasta v0.79 esta ruta insertaba un movimiento `ajuste_pos`/`ajuste_neg` y el
 * trigger actualizaba `stock_items`. O sea: NORA se ponía de autoridad de stock,
 * que es exactamente lo que la regla de oro 1 prohíbe. Es el mismo agujero que
 * se cerró en v0.77 con la pantalla vieja de inventarios; había quedado vivo
 * este, en otra pantalla.
 *
 * Ahora genera la TAREA para que una persona lo corrija en SIFACO. El stock de
 * NORA no se toca: si está mal, se arregla donde manda, y NORA lo va a ver
 * cuando entre la próxima importación.
 *
 * El cuerpo sigue aceptando lo mismo salvo que ahora `cantidad_real` reemplaza
 * a `delta`: se pide cuánto HAY, no cuánto sumar. Pedir un delta obliga a hacer
 * la cuenta mentalmente, y esa cuenta es de donde salen los errores.
 */
export async function POST(req: NextRequest) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no autenticado' }, { status: 401 })
  const { data: me } = await sb.from('users_admin').select('rol, activo').eq('id', user.id)
    .maybeSingle<{ rol: AdminRole; activo: boolean }>()
  if (!me || !me.activo || !['super_admin', 'gerente', 'comprador', 'administrativo', 'sucursal'].includes(me.rol)) {
    return NextResponse.json({ error: 'sin permiso' }, { status: 403 })
  }

  let body: { producto_id?: string; sucursal_id?: string; cantidad_real?: unknown; motivo?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'body inválido' }, { status: 400 }) }

  const { producto_id, sucursal_id } = body
  const cantidadReal = Number(body?.cantidad_real)
  const motivo = String(body?.motivo ?? '').trim()
  if (!producto_id || !sucursal_id || !Number.isFinite(cantidadReal) || cantidadReal < 0) {
    return NextResponse.json({ error: 'producto, sucursal y la cantidad real (≥0) son obligatorios' }, { status: 400 })
  }
  if (motivo.length < 3) return NextResponse.json({ error: 'el motivo es obligatorio' }, { status: 400 })

  const adm = createAdminClient()
  const [{ data: prod }, { data: st }] = await Promise.all([
    adm.from('productos_catalogo').select('sku, nombre').eq('id', producto_id).maybeSingle<{ sku: string | null; nombre: string }>(),
    adm.from('stock_items').select('cantidad').eq('producto_id', producto_id).eq('sucursal_id', sucursal_id).maybeSingle<{ cantidad: number | null }>(),
  ])

  const r = await pedirCorreccionDeStock({
    productoId: producto_id,
    sku: prod?.sku ?? null,
    descripcion: prod?.nombre ?? 'producto',
    puntoId: sucursal_id,
    // Null si el producto no tiene fila de stock en ese punto: es "no se sabe",
    // no "hay cero".
    cantidadSistema: st ? Number(st.cantidad ?? 0) : null,
    cantidadReal,
    motivo,
    origen: 'la ficha del producto, en Stock',
    autorId: user.id,
  })

  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
  return NextResponse.json({ ok: true, tareaId: r.tareaId })
}
