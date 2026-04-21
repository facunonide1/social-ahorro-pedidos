import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function Home() {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await sb
    .from('users_pedidos')
    .select('role, active')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile || !profile.active) redirect('/login?error=sin_permiso')

  if (profile.role === 'repartidor') redirect('/repartidor')
  redirect('/dashboard')
}
