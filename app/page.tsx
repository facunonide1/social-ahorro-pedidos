import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

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

  // Si supabase devuelve error (RLS, function broken, etc.), no lo
  // silenciemos con un redirect: que el error boundary lo muestre.
  if (error) {
    throw new Error(
      `profile_query_failed: ${error.message} | code=${error.code} | hint=${error.hint ?? ''} | user=${user.id}`
    )
  }

  if (!profile) {
    throw new Error(
      `sin_profile: el usuario ${user.email} (id=${user.id}) se autentica en Supabase Auth pero no tiene fila visible en public.users_pedidos. Verificá que exista con ese id y que las RLS policies permitan leerla.`
    )
  }

  if (!profile.active) redirect('/logout?reason=sin_permiso')

  if (profile.role === 'repartidor') redirect('/repartidor')
  redirect('/dashboard')
}
