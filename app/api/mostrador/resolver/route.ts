import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { puede, type PermisosCustom } from '@/lib/types/permisos'
import type { AdminRole } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * C.3 · SE CARGA AHÍ MISMO.
 *
 * Sin salir de la pantalla del mostrador. El empleado elige una de las cuatro
 * salidas y esto deja el pedido o la transferencia **y la reserva**, en una
 * sola transacción.
 *
 * ── LO QUE NO HACE ──────────────────────────────────────────────────────────
 *
 * No vende, no factura y no mueve stock. Regla de oro 1: SIFACO es la
 * autoridad de precio y facturación. Esto deja la intención registrada y el
 * stock apartado; la venta se hace en SIFACO cuando el producto llega.
 *
 * ── Y LO QUE NO GUARDA ──────────────────────────────────────────────────────
 *
 * El nombre y el teléfono del cliente se guardan porque hace falta para
 * avisarle que llegó: es un hecho comercial. **Nada de por qué lo compra.** No
 * hay campo de motivo, de síntoma ni de diagnóstico en ninguna de las tablas
 * que esto toca.
 */

async function gate() {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: 'no autenticado', status: 401 as const }
  const { data: me } = await sb.from('users_admin')
    .select('rol, activo, permisos_custom, sucursal_id').eq('id', user.id)
    .maybeSingle<{ rol: AdminRole; activo: boolean; permisos_custom: PermisosCustom | null; sucursal_id: string | null }>()
  if (!me?.activo) return { error: 'usuario inactivo', status: 403 as const }
  // Quien atiende el mostrador toma pedidos: alcanza con poder crear en
  // operaciones. No hace falta el permiso de compras ni el de finanzas.
  if (!puede(me.rol, me.permisos_custom ?? null, 'operaciones', 'crear')) {
    return { error: 'sin permiso para tomar pedidos en el mostrador', status: 403 as const }
  }
  return { ok: true as const, userId: user.id, sucursalId: me.sucursal_id }
}

export async function POST(req: NextRequest) {
  const g = await gate()
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })

  const b = await req.json().catch(() => null)
  // La sucursal que PIDE es siempre la del que atiende: es donde está parado.
  const pide = g.sucursalId ?? (typeof b?.sucursal_pide === 'string' ? b.sucursal_pide : null)
  if (!pide) {
    return NextResponse.json({
      error: 'No tenés una sucursal asignada, así que no se sabe desde dónde se pide.',
    }, { status: 400 })
  }
  if (g.sucursalId && b?.sucursal_pide && b.sucursal_pide !== g.sucursalId) {
    return NextResponse.json({ error: 'sólo podés pedir desde tu sucursal' }, { status: 403 })
  }
  if (!b?.producto_id || !b?.sucursal_tiene || !b?.salida) {
    return NextResponse.json({ error: 'falta el producto, la sucursal que lo tiene o la salida' }, { status: 400 })
  }

  const adm = createAdminClient()
  const { data, error } = await adm.rpc('mostrador_resolver_faltante', {
    p_producto: b.producto_id,
    p_sucursal_pide: pide,
    p_sucursal_tiene: b.sucursal_tiene,
    p_salida: b.salida,
    p_cantidad: Number(b?.cantidad ?? 1),
    p_cliente_id: b?.cliente_id ?? null,
    p_cliente_nombre: b?.cliente_nombre ?? null,
    p_cliente_telefono: b?.cliente_telefono ?? null,
    p_direccion: b?.direccion ?? null,
    p_usuario: g.userId,
    p_horas_reserva: Number(b?.horas_reserva ?? 48),
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  const r = data as any
  // La función devuelve el motivo en vez de lanzar: así el rechazo llega con
  // la explicación y no como un error de base de datos.
  if (!r?.ok) return NextResponse.json({ error: r?.motivo ?? 'no se pudo' }, { status: 409 })
  return NextResponse.json(r)
}
