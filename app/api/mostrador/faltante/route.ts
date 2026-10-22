import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { puede, type PermisosCustom } from '@/lib/types/permisos'
import type { AdminRole } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * D.1 · REGISTRAR EL FALTANTE CUESTA UN TOQUE.
 *
 * El empleado ya escribió el nombre para buscarlo. Si no apareció, el sistema
 * pregunta «¿se lo llevó o se fue?» y listo. Esta ruta es ese toque.
 *
 * ── QUÉ RECIBE Y QUÉ NO ─────────────────────────────────────────────────────
 *
 * Recibe el texto que el empleado escribió para **buscar un producto**, el
 * desenlace, y el producto si se matcheó.
 *
 * **No recibe ni guarda:** por qué lo pedían, para qué, para quién, ni nada
 * que describa a una persona. No hay campo en `demanda_invisible` donde
 * ponerlo (migración 0223), y si alguien lo manda, se ignora.
 *
 * Esto importa porque es la ruta donde más tienta: la frase sería «guardemos
 * para qué lo querían, así la sugerencia mejora». No se guarda.
 */

const DESENLACES = ['se_fue', 'se_llevo_otra', 'se_le_ofrecio_traer', 'no_se_registro']

async function gate() {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: 'no autenticado', status: 401 as const }
  const { data: me } = await sb.from('users_admin')
    .select('rol, activo, permisos_custom, sucursal_id').eq('id', user.id)
    .maybeSingle<{ rol: AdminRole; activo: boolean; permisos_custom: PermisosCustom | null; sucursal_id: string | null }>()
  if (!me?.activo) return { error: 'usuario inactivo', status: 403 as const }
  if (!puede(me.rol, me.permisos_custom ?? null, 'operaciones', 'crear')) {
    return { error: 'sin permiso para registrar faltantes', status: 403 as const }
  }
  return { ok: true as const, userId: user.id, sucursalId: me.sucursal_id }
}

export async function POST(req: NextRequest) {
  const g = await gate()
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })

  const b = await req.json().catch(() => null)
  const sucursal = g.sucursalId ?? (typeof b?.sucursal_id === 'string' ? b.sucursal_id : null)
  if (!sucursal) {
    return NextResponse.json({
      error: 'Falta la sucursal. Un faltante sin sucursal no dice dónde comprar.',
    }, { status: 400 })
  }
  if (g.sucursalId && b?.sucursal_id && b.sucursal_id !== g.sucursalId) {
    return NextResponse.json({ error: 'sólo podés registrar faltantes de tu sucursal' }, { status: 403 })
  }

  const desenlace = DESENLACES.includes(b?.desenlace) ? b.desenlace : 'no_se_registro'
  const texto = typeof b?.texto === 'string' ? b.texto.trim() : ''
  if (!texto && !b?.producto_id) {
    return NextResponse.json({ error: 'falta qué pidieron' }, { status: 400 })
  }

  const adm = createAdminClient()
  const { data, error } = await adm.rpc('demanda_registrar', {
    p_texto: texto,
    p_sucursal: sucursal,
    p_desenlace: desenlace,
    p_producto: b?.producto_id ?? null,
    p_usuario: g.userId,
    p_cantidad: Number(b?.cantidad ?? 1),
    p_reemplazo: b?.reemplazo_producto_id ?? null,
    p_order: b?.order_id ?? null,
    p_transf: b?.transferencia_id ?? null,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  const r = data as any
  if (!r?.ok) return NextResponse.json({ error: r?.motivo ?? 'no se pudo' }, { status: 400 })
  return NextResponse.json(r)
}
