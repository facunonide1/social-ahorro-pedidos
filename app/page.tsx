import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DiagnosticPanel from './_diag'

export const dynamic = 'force-dynamic'

/**
 * Router raíz. Detecta en qué tabla de perfiles está el user y manda
 * a la app correspondiente:
 *
 *   - Fila activa en `users_admin` (Admin Hub)       → /hub
 *   - Fila activa en `users_pedidos` (CRM pedidos)   → /dashboard o /repartidor
 *   - En las dos: prioriza Admin Hub (se puede cambiar desde /hub).
 *   - En ninguna: panel de diagnóstico (no autobloquea).
 */
export default async function Home() {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/login')

  // 1) ¿Está en Admin Hub?
  const { data: adminProfile, error: adminErr } = await sb
    .from('users_admin')
    .select('rol, activo')
    .eq('id', user.id)
    .maybeSingle()

  if (adminProfile?.activo) {
    redirect('/hub')
  }

  // 2) ¿Está en CRM pedidos?
  const { data: pedidosProfile, error: pedidosErr } = await sb
    .from('users_pedidos')
    .select('role, active')
    .eq('id', user.id)
    .maybeSingle()

  if (pedidosErr) {
    return (
      <DiagnosticPanel
        title="Error consultando users_pedidos"
        details={{
          message: pedidosErr.message,
          code: (pedidosErr as any).code ?? '',
          hint: (pedidosErr as any).hint ?? '',
          details: (pedidosErr as any).details ?? '',
          user_id: user.id,
          user_email: user.email,
        }}
      />
    )
  }

  if (pedidosProfile?.active) {
    if (pedidosProfile.role === 'repartidor') redirect('/repartidor')
    redirect('/dashboard')
  }

  // 3) No está en ninguna. Mostramos diagnóstico con todas las pistas.
  return (
    <DiagnosticPanel
      title="Usuario autenticado sin perfil en ninguna app"
      details={{
        user_id: user.id,
        user_email: user.email,
        users_admin:   adminErr   ? `error: ${adminErr.message}`   : adminProfile   ? `encontrado pero inactivo (rol ${adminProfile.rol})`     : 'sin fila',
        users_pedidos: pedidosProfile ? `encontrado pero inactivo (rol ${pedidosProfile.role})` : 'sin fila',
        hint:
          'El user existe en auth.users pero no tiene perfil activo en users_admin ni en users_pedidos. ' +
          'Si es admin del Admin Hub: verificá que la fila en users_admin tenga activo=true. ' +
          'Si es operador del CRM pedidos: verificá users_pedidos. ' +
          'Si acabás de bootstrappearlo, probá logout + login para refrescar la sesión.',
      }}
    />
  )
}
