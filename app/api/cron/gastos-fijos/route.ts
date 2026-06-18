import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isCronRequest } from '@/lib/cron/auth'
import type { AdminRole } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Genera las instancias mensuales de los gastos fijos activos (FIN · T6).
 * GET: cron (cron-secret). POST: super_admin/gerente/tesoreria manual.
 * Idempotente: UNIQUE (gasto_fijo_id, periodo) evita duplicar; usa ignoreDuplicates.
 * Acepta ?periodo=YYYY-MM (default: mes actual).
 */
export async function GET(req: NextRequest) {
  if (!isCronRequest(req)) return NextResponse.json({ error: 'sin_secret' }, { status: 401 })
  return run(req.nextUrl.searchParams.get('periodo'))
}
export async function POST(req: NextRequest) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no autenticado' }, { status: 401 })
  const { data: me } = await sb.from('users_admin').select('rol, activo').eq('id', user.id).maybeSingle<{ rol: AdminRole; activo: boolean }>()
  if (!me || !me.activo || !['super_admin', 'gerente', 'tesoreria'].includes(me.rol)) {
    return NextResponse.json({ error: 'requiere super_admin/gerente/tesoreria' }, { status: 403 })
  }
  let periodo: string | null = null
  try { periodo = (await req.json())?.periodo ?? null } catch { /* sin body */ }
  return run(periodo)
}

async function run(periodoIn: string | null) {
  const adm = createAdminClient()
  const periodo = periodoIn && /^\d{4}-\d{2}$/.test(periodoIn) ? periodoIn : new Date().toISOString().slice(0, 7)
  const [y, m] = periodo.split('-').map(Number)

  const { data: gastos } = await adm.from('gastos_fijos').select('id, monto, dia_mes, es_demo').eq('activo', true).eq('frecuencia', 'mensual')
  if (!gastos?.length) return NextResponse.json({ ok: true, periodo, generadas: 0 })

  const ultimoDia = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const rows = gastos.map((g) => {
    const dia = Math.min(g.dia_mes ?? 1, ultimoDia)
    return {
      gasto_fijo_id: g.id, periodo, monto: g.monto,
      vencimiento: `${periodo}-${String(dia).padStart(2, '0')}`,
      estado: 'pendiente', es_demo: g.es_demo ?? false,
    }
  })

  const { data, error } = await adm.from('gastos_fijos_instancias')
    .upsert(rows, { onConflict: 'gasto_fijo_id,periodo', ignoreDuplicates: true })
    .select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, periodo, generadas: data?.length ?? 0 })
}
