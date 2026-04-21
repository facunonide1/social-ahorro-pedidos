import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DiagnosticPanel from './_diag'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile, error } = await sb
    .from('users_pedidos')
    .select('role, active')
    .eq('id', user.id)
    .maybeSingle()

  if (error) {
    return (
      <DiagnosticPanel
        title="Error consultando users_pedidos"
        details={{
          message: error.message,
          code: (error as any).code ?? '',
          hint: (error as any).hint ?? '',
          details: (error as any).details ?? '',
          user_id: user.id,
          user_email: user.email,
        }}
      />
    )
  }

  if (!profile) {
    return (
      <DiagnosticPanel
        title="Usuario autenticado sin fila visible en users_pedidos"
        details={{
          user_id: user.id,
          user_email: user.email,
          hint:
            'El JWT está OK, pero el SELECT .eq("id", user.id) sobre users_pedidos devolvió 0 filas. Puede ser: (a) la fila no existe con ese id, (b) las RLS policies no permiten leerla a este user, (c) las env vars de Vercel apuntan a otro proyecto de Supabase.',
        }}
      />
    )
  }

  if (!profile.active) redirect('/logout?reason=sin_permiso')

  if (profile.role === 'repartidor') redirect('/repartidor')
  redirect('/dashboard')
}
