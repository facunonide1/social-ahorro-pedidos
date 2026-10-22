import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { AdminRole } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const ROLES: AdminRole[] = [
  'super_admin', 'gerente', 'encargado_sucursal', 'sucursal', 'empleado_general', 'administrativo',
]

/**
 * C.1 · CARGAR UN LOTE DESDE EL CELULAR.
 *
 * ── POR QUÉ ES UNA RUTA Y NO UN INSERT DIRECTO ──────────────────────────────
 *
 * Porque se usa parado en el depósito con mala señal, y hay que poder mandar
 * varios lotes del mismo producto de una. Un insert por lote desde el cliente
 * con señal mala deja la mitad cargada y nadie sabe cuál.
 *
 * Y porque la sucursal NO se toma del cuerpo: sale del usuario. Cargar un
 * vencimiento en la sucursal equivocada es peor que no cargarlo — la
 * mercadería vence en un lugar y el aviso suena en otro.
 */
export async function POST(req: NextRequest) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no autenticado' }, { status: 401 })

  const { data: me } = await sb.from('users_admin')
    .select('rol, activo, sucursal_id').eq('id', user.id)
    .maybeSingle<{ rol: AdminRole; activo: boolean; sucursal_id: string | null }>()
  if (!me?.activo || !ROLES.includes(me.rol)) {
    return NextResponse.json({ error: 'sin permiso para cargar vencimientos' }, { status: 403 })
  }

  const b = await req.json().catch(() => null)
  const productoId = typeof b?.producto_id === 'string' ? b.producto_id : null
  const lotes = Array.isArray(b?.lotes) ? b.lotes : null
  // Quien no tiene sucursal asignada (un dueño) tiene que decir cuál.
  const sucursalId = me.sucursal_id ?? (typeof b?.sucursal_id === 'string' ? b.sucursal_id : null)

  if (!productoId || !lotes?.length) {
    return NextResponse.json({ error: 'falta el producto o los lotes' }, { status: 400 })
  }
  if (!sucursalId) {
    return NextResponse.json({ error: 'falta la sucursal: no tenés una asignada, elegila' }, { status: 400 })
  }

  type LoteLimpio = {
    producto_id: string; sucursal_id: string; numero_lote: string | null
    fecha_vencimiento: string; cantidad_actual: number; estado: 'activo'; es_demo: boolean
  }
  const limpios: LoteLimpio[] = lotes
    .map((l: any) => ({
      producto_id: productoId,
      sucursal_id: sucursalId,
      numero_lote: l?.numero_lote ? String(l.numero_lote).trim() : null,
      fecha_vencimiento: String(l?.fecha_vencimiento ?? ''),
      cantidad_actual: Number(l?.cantidad ?? 0),
      estado: 'activo' as const,
      es_demo: false,
    }))
    .filter((l: LoteLimpio) => /^\d{4}-\d{2}-\d{2}$/.test(l.fecha_vencimiento) && l.cantidad_actual > 0)

  if (!limpios.length) {
    return NextResponse.json({
      error: 'Ningún lote tiene fecha válida y cantidad. Una fecha sin cantidad no sirve: no se sabe cuánto vence.',
    }, { status: 400 })
  }

  const adm = createAdminClient()
  const { data, error } = await adm.from('lotes_productos').insert(limpios).select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, cargados: data?.length ?? 0 })
}
