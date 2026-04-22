import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { UserPedidos, ZonaReparto, AppSettings } from '@/lib/types'
import ZonasEditor from './zonas-editor'
import UsuariosEditor from './usuarios-editor'
import HorariosEditor from './horarios-editor'
import SalesChart from './sales-chart'

export const dynamic = 'force-dynamic'

export default async function ConfiguracionPage() {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await sb
    .from('users_pedidos')
    .select('id, email, name, role, active')
    .eq('id', user.id)
    .maybeSingle<UserPedidos>()

  if (!profile?.active) redirect('/logout?reason=sin_permiso')
  if (profile.role !== 'admin') redirect('/dashboard')

  const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29); thirtyDaysAgo.setHours(0,0,0,0)

  const [zonasRes, usersRes, settingsRes, salesRes] = await Promise.all([
    sb.from('zonas_reparto')
      .select('*')
      .order('activa', { ascending: false })
      .order('nombre', { ascending: true })
      .returns<ZonaReparto[]>(),
    sb.from('users_pedidos')
      .select('id, email, name, role, active')
      .order('active', { ascending: false })
      .order('name', { ascending: true })
      .returns<UserPedidos[]>(),
    sb.from('app_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle<AppSettings>(),
    sb.from('orders')
      .select('created_at, total, status')
      .gte('created_at', thirtyDaysAgo.toISOString()),
  ])

  const settings: AppSettings = settingsRes.data ?? {
    id: 1, hora_apertura: 8, hora_cierre: 20, updated_at: new Date().toISOString(),
  }

  // Agrupo por día local AR (últimos 30 días, incluyendo hoy)
  const salesByDay = new Map<string, { count: number; total: number }>()
  for (let i = 29; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0,0,0,0)
    const key = d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
    salesByDay.set(key, { count: 0, total: 0 })
  }
  for (const r of (salesRes.data ?? []) as any[]) {
    const d = new Date(r.created_at)
    const key = d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
    const bucket = salesByDay.get(key)
    if (!bucket) continue
    bucket.count += 1
    if (r.status !== 'cancelado') bucket.total += Number(r.total || 0)
  }
  const buckets = Array.from(salesByDay.entries()).map(([date, v]) => ({ date, ...v }))

  return (
    <div style={{ minHeight: '100vh', background: '#faf8f5', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', color: '#2a2a2a' }}>
      <header style={{ background: '#fff', borderBottom: '0.5px solid #ede9e4', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <Link href="/dashboard" style={{ textDecoration: 'none', color: '#726DFF', fontSize: 14, fontWeight: 600 }}>
          ← Volver
        </Link>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.3px' }}>Configuración</div>
          <div style={{ fontSize: 12, color: '#999' }}>Solo administradores. Cambios impactan a todo el equipo.</div>
        </div>
      </header>

      <main style={{ padding: 20, maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <section style={{ background: '#fff', border: '0.5px solid #ede9e4', borderRadius: 16, padding: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.4px', marginBottom: 10 }}>
            VENTAS ÚLTIMOS 30 DÍAS
          </div>
          <SalesChart buckets={buckets} />
        </section>

        <section style={{ background: '#fff', border: '0.5px solid #ede9e4', borderRadius: 16, padding: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.4px', marginBottom: 10 }}>
            HORARIO DE ATENCIÓN
          </div>
          <HorariosEditor initial={settings} />
        </section>

        <section style={{ background: '#fff', border: '0.5px solid #ede9e4', borderRadius: 16, padding: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.4px', marginBottom: 10 }}>
            ZONAS DE REPARTO
          </div>
          <ZonasEditor initialZonas={zonasRes.data ?? []} />
        </section>

        <section style={{ background: '#fff', border: '0.5px solid #ede9e4', borderRadius: 16, padding: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.4px', marginBottom: 10 }}>
            USUARIOS DEL CRM
          </div>
          <UsuariosEditor initialUsers={usersRes.data ?? []} currentUserId={profile.id} />
        </section>
      </main>
    </div>
  )
}
