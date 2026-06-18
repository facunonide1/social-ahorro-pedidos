import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { analizarImportStock, confirmarImportStock, type FilaImport, type ItemAnalizado } from '@/lib/inventario/procesar-stock-import'
import type { AdminRole } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

async function gate() {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: 'no autenticado', status: 401 as const }
  const { data: me } = await sb.from('users_admin').select('rol, activo').eq('id', user.id)
    .maybeSingle<{ rol: AdminRole; activo: boolean }>()
  if (!me || !me.activo || !['super_admin', 'gerente', 'comprador'].includes(me.rol)) {
    return { error: 'requiere super_admin / gerente / comprador', status: 403 as const }
  }
  return { ok: true as const, userId: user.id }
}

/** Importador de stock diario (OPS · T3): { accion: 'analizar' | 'confirmar' }. */
export async function POST(req: NextRequest) {
  const g = await gate()
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'body inválido' }, { status: 400 }) }
  const adm = createAdminClient()

  if (body?.accion === 'analizar') {
    const sucursalId = String(body?.sucursalId ?? '')
    const filas = (body?.filas ?? []) as FilaImport[]
    if (!sucursalId || filas.length === 0) {
      return NextResponse.json({ error: 'sucursal y filas requeridas' }, { status: 400 })
    }
    const items = await analizarImportStock(adm, sucursalId, filas)
    return NextResponse.json({ ok: true, items })
  }

  if (body?.accion === 'confirmar') {
    const { sucursalId, fecha, archivo, hash, mapeo } = body
    const items = (body?.items ?? []) as ItemAnalizado[]
    if (!sucursalId || !hash || items.length === 0) {
      return NextResponse.json({ error: 'datos incompletos' }, { status: 400 })
    }
    try {
      const res = await confirmarImportStock(adm, {
        sucursalId, fecha: fecha ?? new Date().toISOString().slice(0, 10),
        archivo: archivo ?? 'import.xlsx', hash, mapeo, items, userId: g.userId,
      })
      // Guardar mapeo reusable (si vino y no existe uno igual de nombre)
      if (mapeo && body?.guardarMapeo) {
        await adm.from('config_import_stock').insert({
          nombre: body?.nombreMapeo || 'Mapeo SIFACO', tipo: 'stock', mapeo_columnas: mapeo,
        }).then(() => {}, () => {})
      }
      return NextResponse.json({ ok: true, ...res })
    } catch (e: any) {
      return NextResponse.json({ error: e?.message ?? 'error al confirmar' }, { status: 400 })
    }
  }

  return NextResponse.json({ error: 'acción inválida' }, { status: 400 })
}
