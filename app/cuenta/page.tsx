import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { UserPedidos } from '@/lib/types'
import MfaSection from './mfa'

export const dynamic = 'force-dynamic'

export default async function CuentaPage() {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await sb
    .from('users_pedidos').select('id, email, name, role, active').eq('id', user.id).maybeSingle<UserPedidos>()
  if (!profile?.active) redirect('/logout?reason=sin_permiso')

  return (
    <div style={{ minHeight: '100vh', background: '#faf8f5', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', color: '#2a2a2a' }}>
      <header style={{ background: '#fff', borderBottom: '0.5px solid #ede9e4', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <Link href={profile.role === 'repartidor' ? '/repartidor' : '/dashboard'}
          style={{ textDecoration: 'none', color: '#726DFF', fontSize: 14, fontWeight: 600 }}>
          ← Volver
        </Link>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.3px' }}>Mi cuenta</div>
          <div style={{ fontSize: 12, color: '#999' }}>{profile.name || profile.email} · {profile.role}</div>
        </div>
      </header>

      <main style={{ padding: 20, maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <section style={{ background: '#fff', border: '0.5px solid #ede9e4', borderRadius: 16, padding: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.4px', marginBottom: 10 }}>
            VERIFICACIÓN EN DOS PASOS
          </div>
          <MfaSection />
        </section>
      </main>
    </div>
  )
}
