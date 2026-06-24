import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import type { AdminRole } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * ⚠️ ENDPOINT TEMPORAL DE DIAGNÓSTICO — BORRAR DESPUÉS DE USAR.
 * Reporta qué variables de entorno llegan al runtime de producción, SIN exponer
 * valores completos de secretos (solo presente sí/no + 6 chars enmascarados).
 * Gateado a super_admin logueado; responde 404 a cualquier otro (repo público).
 */

// Variables a chequear. `secreto: false` → muestra el valor completo (URLs no
// son secretas y ayudan a verificar que apunte al lugar correcto).
const VARS: { name: string; secreto: boolean }[] = [
  { name: 'ANTHROPIC_API_KEY', secreto: true },
  { name: 'NEXT_PUBLIC_SUPABASE_URL', secreto: false },
  { name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', secreto: true },
  { name: 'SUPABASE_SERVICE_ROLE_KEY', secreto: true },
  { name: 'RESEND_API_KEY', secreto: true },
  { name: 'WOOCOMMERCE_URL', secreto: false },
  { name: 'WOOCOMMERCE_CONSUMER_KEY', secreto: true },
  { name: 'WOOCOMMERCE_CONSUMER_SECRET', secreto: true },
  { name: 'WOO_WEBHOOK_SECRET', secreto: true },
]

function reportar(name: string, secreto: boolean) {
  const raw = process.env[name]
  const presente = raw !== undefined && raw !== null
  const vacio = !raw || raw.trim() === ''
  let preview: string | null = null
  if (presente && !vacio) {
    preview = secreto ? `${raw.slice(0, 6)}…(${raw.length} chars)` : raw
  }
  return { name, presente, vacio, len: presente ? raw!.length : 0, preview }
}

export async function GET() {
  // Gate: solo super_admin logueado. 404 para todo lo demás (no revela existencia).
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const { data: me } = await sb
    .from('users_admin')
    .select('rol, activo')
    .eq('id', user.id)
    .maybeSingle<{ rol: AdminRole; activo: boolean }>()
  if (!me?.activo || me.rol !== 'super_admin')
    return NextResponse.json({ error: 'not found' }, { status: 404 })

  return NextResponse.json(
    {
      entorno: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'desconocido',
      region: process.env.VERCEL_REGION ?? null,
      generado: new Date().toISOString(),
      variables: VARS.map((v) => reportar(v.name, v.secreto)),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
