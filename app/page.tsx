import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await sb
    .from('users_pedidos')
    .select('role, active')
    .eq('id', user.id)
    .maybeSingle()

  // Si el user auth existe pero no tiene perfil activo en users_pedidos,
  // paso por /logout (Route Handler) para que se limpien las cookies de
  // sesión ANTES de redirigir a /login y así evitar el loop
  // /login -> / -> /login cuando el middleware detecta la sesión.
  if (!profile || !profile.active) redirect('/logout?reason=sin_permiso')

  if (profile.role === 'repartidor') redirect('/repartidor')
  redirect('/dashboard')
}
