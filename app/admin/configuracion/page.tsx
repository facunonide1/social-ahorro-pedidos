import { redirect } from 'next/navigation'
import { Download } from 'lucide-react'

import { createClient } from '@/lib/supabase/server'
import type { UserPedidos, ZonaReparto, AppSettings } from '@/lib/types'

import { CrmShell } from '@/components/crm/crm-shell'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

import HorariosEditor from './horarios-editor'
import SalesChart from './sales-chart'
import TeamStats from './team-stats'
import UsuariosEditor from './usuarios-editor'
import ZonasEditor from './zonas-editor'

export const dynamic = 'force-dynamic'

type SalesRow = { created_at: string; total: number; status: string }
type ZonaInfo = { id: string; nombre: string; color: string }
type StatsRow = {
  assigned_to: string | null
  zona_id: string | null
  status: string
  created_at: string
  confirmed_at: string | null
  delivered_at: string | null
  zonas_reparto: ZonaInfo | ZonaInfo[] | null
}

function pickZona(z: ZonaInfo | ZonaInfo[] | null | undefined): ZonaInfo | null {
  if (!z) return null
  return Array.isArray(z) ? z[0] ?? null : z
}

export default async function ConfiguracionPage() {
  const sb = createClient()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await sb
    .from('users_pedidos')
    .select('id, email, name, role, active')
    .eq('id', user.id)
    .maybeSingle<UserPedidos>()

  if (!profile?.active) redirect('/logout?reason=sin_permiso')
  if (profile.role !== 'admin') redirect('/dashboard')

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29)
  thirtyDaysAgo.setHours(0, 0, 0, 0)

  const [zonasRes, usersRes, settingsRes, salesRes, statsRes, repsRes] = await Promise.all([
    sb
      .from('zonas_reparto')
      .select('*')
      .order('activa', { ascending: false })
      .order('nombre', { ascending: true })
      .returns<ZonaReparto[]>(),
    sb
      .from('users_pedidos')
      .select('id, email, name, role, active')
      .order('active', { ascending: false })
      .order('name', { ascending: true })
      .returns<UserPedidos[]>(),
    sb.from('app_settings').select('*').eq('id', 1).maybeSingle<AppSettings>(),
    sb
      .from('orders')
      .select('created_at, total, status')
      .gte('created_at', thirtyDaysAgo.toISOString()),
    sb
      .from('orders')
      .select(
        'assigned_to, zona_id, status, created_at, confirmed_at, delivered_at, zonas_reparto(id, nombre, color)',
      )
      .gte('created_at', thirtyDaysAgo.toISOString()),
    sb
      .from('users_pedidos')
      .select('id, name, email')
      .eq('role', 'repartidor')
      .eq('active', true)
      .returns<Pick<UserPedidos, 'id' | 'name' | 'email'>[]>(),
  ])

  const settings: AppSettings = settingsRes.data ?? {
    id: 1,
    hora_apertura: 8,
    hora_cierre: 20,
    updated_at: new Date().toISOString(),
  }

  const salesByDay = new Map<string, { count: number; total: number }>()
  for (let i = 29; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    d.setHours(0, 0, 0, 0)
    const key = d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
    salesByDay.set(key, { count: 0, total: 0 })
  }
  for (const r of (salesRes.data ?? []) as SalesRow[]) {
    const d = new Date(r.created_at)
    const key = d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
    const bucket = salesByDay.get(key)
    if (!bucket) continue
    bucket.count += 1
    if (r.status !== 'cancelado') bucket.total += Number(r.total || 0)
  }
  const buckets = Array.from(salesByDay.entries()).map(([date, v]) => ({ date, ...v }))

  const repMap = new Map<
    string,
    { name: string; delivered: number; in_progress: number; totalMs: number; samples: number }
  >()
  for (const r of repsRes.data ?? []) {
    repMap.set(r.id, {
      name: r.name || r.email,
      delivered: 0,
      in_progress: 0,
      totalMs: 0,
      samples: 0,
    })
  }
  for (const o of (statsRes.data ?? []) as StatsRow[]) {
    if (!o.assigned_to) continue
    const entry = repMap.get(o.assigned_to)
    if (!entry) continue
    if (o.status === 'entregado') {
      entry.delivered += 1
      const c = o.confirmed_at
        ? new Date(o.confirmed_at).getTime()
        : new Date(o.created_at).getTime()
      const d = o.delivered_at ? new Date(o.delivered_at).getTime() : 0
      if (d > c) {
        entry.totalMs += d - c
        entry.samples += 1
      }
    } else if (!['entregado', 'cancelado'].includes(o.status)) {
      entry.in_progress += 1
    }
  }
  const repStats = Array.from(repMap.entries())
    .map(([id, v]) => ({
      id,
      name: v.name,
      delivered: v.delivered,
      in_progress: v.in_progress,
      avg_minutes: v.samples > 0 ? Math.round(v.totalMs / v.samples / 60000) : null,
    }))
    .sort((a, b) => b.delivered - a.delivered)

  const zoneMap = new Map<
    string | null,
    {
      id: string | null
      name: string
      color: string
      total: number
      delivered: number
      totalMs: number
      samples: number
    }
  >()
  zoneMap.set(null, {
    id: null,
    name: 'Sin zona',
    color: 'hsl(var(--muted-foreground))',
    total: 0,
    delivered: 0,
    totalMs: 0,
    samples: 0,
  })
  for (const o of (statsRes.data ?? []) as StatsRow[]) {
    const zid: string | null = o.zona_id ?? null
    if (!zoneMap.has(zid)) {
      const z = pickZona(o.zonas_reparto)
      zoneMap.set(zid, {
        id: zid,
        name: z?.nombre ?? '(zona eliminada)',
        color: z?.color ?? 'hsl(var(--muted-foreground))',
        total: 0,
        delivered: 0,
        totalMs: 0,
        samples: 0,
      })
    }
    const entry = zoneMap.get(zid)!
    entry.total += 1
    if (o.status === 'entregado') {
      entry.delivered += 1
      const c = o.confirmed_at
        ? new Date(o.confirmed_at).getTime()
        : new Date(o.created_at).getTime()
      const d = o.delivered_at ? new Date(o.delivered_at).getTime() : 0
      if (d > c) {
        entry.totalMs += d - c
        entry.samples += 1
      }
    }
  }
  const zoneStats = Array.from(zoneMap.values())
    .filter((z) => z.total > 0)
    .map((z) => ({
      id: z.id,
      name: z.name,
      color: z.color,
      total: z.total,
      delivered: z.delivered,
      avg_minutes: z.samples > 0 ? Math.round(z.totalMs / z.samples / 60000) : null,
    }))
    .sort((a, b) => b.total - a.total)

  return (
    <CrmShell>
      <PageHeader
        title="Configuración"
        description="Solo administradores. Cambios impactan a todo el equipo."
      />

      <div className="mx-auto w-full max-w-5xl space-y-4 p-4 md:p-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Ventas últimos 30 días
            </CardTitle>
          </CardHeader>
          <CardContent>
            <SalesChart buckets={buckets} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Performance del equipo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TeamStats reps={repStats} zones={zoneStats} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Horario de atención
            </CardTitle>
          </CardHeader>
          <CardContent>
            <HorariosEditor initial={settings} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Zonas de reparto
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ZonasEditor initialZonas={zonasRes.data ?? []} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Usuarios del CRM
            </CardTitle>
          </CardHeader>
          <CardContent>
            <UsuariosEditor
              initialUsers={usersRes.data ?? []}
              currentUserId={profile.id}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Backup
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Descarga un snapshot completo en JSON de las tablas operativas
              (zonas, usuarios, clientes, pedidos, historial, mensajes,
              incidencias y configuración). Útil para archivo mensual; guardalo
              en un lugar seguro.
            </p>
            <Button asChild variant="secondary" className="w-fit">
              <a href="/api/admin/backup" download>
                <Download className="size-4" />
                Descargar backup JSON
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>
    </CrmShell>
  )
}
