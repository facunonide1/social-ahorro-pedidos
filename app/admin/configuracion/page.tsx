import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { UserPedidos, ZonaReparto, AppSettings } from '@/lib/types'
import ZonasEditor from './zonas-editor'
import UsuariosEditor from './usuarios-editor'
import HorariosEditor from './horarios-editor'
import SalesChart from './sales-chart'
import TeamStats from './team-stats'

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

  const [zonasRes, usersRes, settingsRes, salesRes, statsRes, repsRes] = await Promise.all([
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
    sb.from('orders')
      .select('assigned_to, zona_id, status, created_at, confirmed_at, delivered_at, zonas_reparto(id, nombre, color)')
      .gte('created_at', thirtyDaysAgo.toISOString()),
    sb.from('users_pedidos')
      .select('id, name, email').eq('role', 'repartidor').eq('active', true),
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

  // === REPARTIDORES: entregas, en progreso, tiempo promedio ===
  const repMap = new Map<string, { name: string; delivered: number; in_progress: number; totalMs: number; samples: number }>()
  for (const r of (repsRes.data ?? [])) {
    repMap.set(r.id, { name: r.name || r.email, delivered: 0, in_progress: 0, totalMs: 0, samples: 0 })
  }
  for (const o of (statsRes.data ?? []) as any[]) {
    if (!o.assigned_to) continue
    const entry = repMap.get(o.assigned_to)
    if (!entry) continue
    if (o.status === 'entregado') {
      entry.delivered += 1
      const c = o.confirmed_at ? new Date(o.confirmed_at).getTime() : new Date(o.created_at).getTime()
      const d = o.delivered_at ? new Date(o.delivered_at).getTime() : 0
      if (d > c) { entry.totalMs += d - c; entry.samples += 1 }
    } else if (!['entregado','cancelado'].includes(o.status)) {
      entry.in_progress += 1
    }
  }
  const repStats = Array.from(repMap.entries())
    .map(([id, v]) => ({
      id, name: v.name,
      delivered: v.delivered,
      in_progress: v.in_progress,
      avg_minutes: v.samples > 0 ? Math.round((v.totalMs / v.samples) / 60000) : null,
    }))
    .sort((a, b) => b.delivered - a.delivered)

  // === ZONAS: total, entregados, tiempo promedio ===
  const zoneMap = new Map<string | null, { id: string | null; name: string; color: string; total: number; delivered: number; totalMs: number; samples: number }>()
  zoneMap.set(null, { id: null, name: 'Sin zona', color: '#aaa', total: 0, delivered: 0, totalMs: 0, samples: 0 })
  for (const o of (statsRes.data ?? []) as any[]) {
    const zid: string | null = o.zona_id ?? null
    if (!zoneMap.has(zid)) {
      zoneMap.set(zid, {
        id: zid,
        name: o.zonas_reparto?.nombre ?? '(zona eliminada)',
        color: o.zonas_reparto?.color ?? '#aaa',
        total: 0, delivered: 0, totalMs: 0, samples: 0,
      })
    }
    const entry = zoneMap.get(zid)!
    entry.total += 1
    if (o.status === 'entregado') {
      entry.delivered += 1
      const c = o.confirmed_at ? new Date(o.confirmed_at).getTime() : new Date(o.created_at).getTime()
      const d = o.delivered_at ? new Date(o.delivered_at).getTime() : 0
      if (d > c) { entry.totalMs += d - c; entry.samples += 1 }
    }
  }
  const zoneStats = Array.from(zoneMap.values())
    .filter(z => z.total > 0)
    .map(z => ({
      id: z.id, name: z.name, color: z.color,
      total: z.total, delivered: z.delivered,
      avg_minutes: z.samples > 0 ? Math.round((z.totalMs / z.samples) / 60000) : null,
    }))
    .sort((a, b) => b.total - a.total)

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
            PERFORMANCE DEL EQUIPO
          </div>
          <TeamStats reps={repStats} zones={zoneStats} />
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

        <section style={{ background: '#fff', border: '0.5px solid #ede9e4', borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.4px' }}>
            BACKUP
          </div>
          <div style={{ fontSize: 13, color: '#666' }}>
            Descarga un snapshot completo en JSON de las tablas operativas (zonas, usuarios, clientes, pedidos, historial, mensajes, incidencias y configuración). Útil para archivo mensual; guardalo en un lugar seguro.
          </div>
          <a href="/api/admin/backup" download
            style={{ alignSelf: 'flex-start', padding: '10px 14px', borderRadius: 10, background: '#726DFF', color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
            ⬇ Descargar backup JSON
          </a>
        </section>
      </main>
    </div>
  )
}
