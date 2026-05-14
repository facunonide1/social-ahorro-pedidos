import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { hasAnthropicKey } from '@/lib/ai/client'
import { generarResumenDiario } from '@/lib/ai/resumen-diario'
import { SUMMARY_MODEL } from '@/lib/ai/config'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const GEN_ROLES = ['super_admin', 'gerente']
const READ_ROLES = ['super_admin', 'gerente', 'auditor']

function isCronRequest(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET || process.env.SYNC_CRON_SECRET
  if (!secret) return false
  const auth = req.headers.get('authorization') || ''
  return auth === `Bearer ${secret}` || req.headers.get('x-sync-secret') === secret
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

async function generarYGuardar(sb: ReturnType<typeof createClient>) {
  const { markdown, metricas } = await generarResumenDiario(sb)
  const fecha = todayISO()
  const { data, error } = await sb
    .from('ai_resumenes_diarios')
    .upsert(
      {
        fecha,
        resumen_markdown: markdown,
        metricas,
        generado_at: new Date().toISOString(),
      },
      { onConflict: 'fecha' },
    )
    .select('*')
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

/**
 * GET — uso dual:
 *  - Cron de Vercel (header de secret): genera y guarda el resumen de hoy.
 *  - Usuario autenticado: devuelve el resumen guardado de hoy (read-only).
 */
export async function GET(req: NextRequest) {
  const sb = createClient()

  if (isCronRequest(req)) {
    if (!hasAnthropicKey())
      return NextResponse.json({ error: 'sin_anthropic_key' }, { status: 503 })
    try {
      const row = await generarYGuardar(sb)
      return NextResponse.json({ ok: true, generado: true, resumen: row })
    } catch (e: any) {
      return NextResponse.json(
        { error: e?.message || 'error_generando' },
        { status: 500 },
      )
    }
  }

  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no_autorizado' }, { status: 401 })
  const { data: profile } = await sb
    .from('users_admin')
    .select('rol, activo')
    .eq('id', user.id)
    .maybeSingle<{ rol: string; activo: boolean }>()
  if (!profile?.activo || !READ_ROLES.includes(profile.rol))
    return NextResponse.json({ error: 'sin_permiso' }, { status: 403 })

  const { data } = await sb
    .from('ai_resumenes_diarios')
    .select('*')
    .eq('fecha', todayISO())
    .maybeSingle()
  return NextResponse.json({ ok: true, resumen: data ?? null })
}

/**
 * POST — regeneración manual desde la UI (super_admin / gerente).
 */
export async function POST(req: NextRequest) {
  const sb = createClient()

  if (!isCronRequest(req)) {
    const {
      data: { user },
    } = await sb.auth.getUser()
    if (!user)
      return NextResponse.json({ error: 'no_autorizado' }, { status: 401 })
    const { data: profile } = await sb
      .from('users_admin')
      .select('rol, activo')
      .eq('id', user.id)
      .maybeSingle<{ rol: string; activo: boolean }>()
    if (!profile?.activo || !GEN_ROLES.includes(profile.rol))
      return NextResponse.json({ error: 'sin_permiso' }, { status: 403 })
  }

  if (!hasAnthropicKey())
    return NextResponse.json(
      { error: 'La IA no está configurada (falta ANTHROPIC_API_KEY).' },
      { status: 503 },
    )

  try {
    const row = await generarYGuardar(sb)
    return NextResponse.json({ ok: true, resumen: row, model: SUMMARY_MODEL })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'No se pudo generar el resumen.' },
      { status: 500 },
    )
  }
}
