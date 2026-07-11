import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { AdminRole } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const ROLES: AdminRole[] = ['super_admin', 'gerente', 'comprador', 'administrativo']

/**
 * Guarda la ventana de devolución de un proveedor (OS-3 · A):
 * default en `proveedores.dias_ventana_devolucion` + filas por rubro (reemplazo).
 */
export async function POST(req: NextRequest) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no autenticado' }, { status: 401 })
  const { data: me } = await sb.from('users_admin').select('rol, activo').eq('id', user.id).maybeSingle<{ rol: AdminRole; activo: boolean }>()
  if (!me?.activo || !ROLES.includes(me.rol)) return NextResponse.json({ error: 'sin permiso' }, { status: 403 })

  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'body inválido' }, { status: 400 }) }
  const proveedorId = b?.proveedor_id
  if (!proveedorId) return NextResponse.json({ error: 'proveedor requerido' }, { status: 400 })

  const adm = createAdminClient()
  const diasDefault = b?.dias_default === '' || b?.dias_default == null ? null : Math.max(0, Number(b.dias_default) || 0)
  await adm.from('proveedores').update({ dias_ventana_devolucion: diasDefault }).eq('id', proveedorId)

  const rubros = (Array.isArray(b?.rubros) ? b.rubros : [])
    .map((r: any) => ({ rubro: String(r.rubro ?? '').trim(), dias_ventana: Number(r.dias_ventana), condicion: r.condicion ? String(r.condicion) : null }))
    .filter((r: any) => r.rubro && Number.isFinite(r.dias_ventana) && r.dias_ventana >= 0)

  await adm.from('proveedor_devolucion_rubros').delete().eq('proveedor_id', proveedorId)
  if (rubros.length) {
    const { error } = await adm.from('proveedor_devolucion_rubros').insert(rubros.map((r: any) => ({ proveedor_id: proveedorId, ...r })))
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  }
  return NextResponse.json({ ok: true })
}
