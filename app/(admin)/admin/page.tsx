import { FileText, Ticket, Users, AlertTriangle } from 'lucide-react'

import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { ROLES_TRANSVERSALES, ADMIN_ROLE_LABELS } from '@/lib/types/admin'
import { saludoHora } from '@/lib/utils/saludo'
import { createAdminClient } from '@/lib/supabase/server'
import { KpiCard } from '@/components/cards/kpi-card'

import { NoraBriefingCard } from './nora-briefing-card'
import { NoraPrediccionesPanel } from './nora-predicciones-panel'
import { QuickActions } from './quick-actions'
import { SucursalesLive } from './sucursales-live'

export const dynamic = 'force-dynamic'

type Kpis = {
  ventasHoy: number
  ticketsHoy: number
  ticketPromedio: number
  empleadosActivos: number
  alertasCriticas: number
}

/** KPIs del día — admin client, tolerante a tablas vacías (nunca tira). */
async function getKpis(): Promise<Kpis> {
  const adm = createAdminClient()
  const fechaAR = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(new Date())
  const inicioHoy = `${fechaAR}T00:00:00-03:00`
  const ahora = new Date().toISOString()

  const [ordersRes, empRes, tareasRes, stockRes] = await Promise.all([
    adm.from('orders').select('total').gte('created_at', inicioHoy),
    adm.from('empleados').select('id', { count: 'exact', head: true }).eq('activo', true),
    adm
      .from('tareas')
      .select('id', { count: 'exact', head: true })
      .lt('fecha_vencimiento', ahora)
      .in('estado', ['pendiente', 'asignada', 'en_progreso', 'en_verificacion']),
    adm.from('stock_sucursal').select('cantidad_actual, stock_minimo').gt('stock_minimo', 0).limit(1000),
  ])

  const ordenes = (ordersRes.data ?? []) as { total: number | null }[]
  const ventasHoy = ordenes.reduce((a, o) => a + Number(o.total ?? 0), 0)
  const ticketsHoy = ordenes.length
  const ticketPromedio = ticketsHoy > 0 ? ventasHoy / ticketsHoy : 0
  const empleadosActivos = empRes.count ?? 0
  const stockCritico = ((stockRes.data ?? []) as { cantidad_actual: number; stock_minimo: number }[]).filter(
    (s) => Number(s.cantidad_actual) <= Number(s.stock_minimo),
  ).length
  const alertasCriticas = (tareasRes.count ?? 0) + stockCritico

  return { ventasHoy, ticketsHoy, ticketPromedio, empleadosActivos, alertasCriticas }
}

/**
 * Mission Control (F6.5.T4) — home de NORA HQ.
 *
 * Roles transversales ven el panel completo (greeting + KPIs + quick actions +
 * sucursales en vivo + predicciones). Roles operativos ven greeting + quick
 * actions. Todo tolera datos vacíos.
 */
export default async function MissionControlPage() {
  const profile = await requireAdminHubAccess()
  const esTransversal = ROLES_TRANSVERSALES.includes(profile.rol)
  const fecha = new Date().toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  const kpis = esTransversal ? await getKpis() : null

  return (
    <div className="container mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-6 md:py-8">
      <header>
        <div className="text-[11px] font-medium uppercase tracking-[0.5px] text-muted-foreground">
          Mission Control · {fecha}
        </div>
        <h1 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">
          {saludoHora(profile.nombre, profile.email)}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {ADMIN_ROLE_LABELS[profile.rol]} · NORA HQ
        </p>
      </header>

      <NoraBriefingCard />

      {kpis && (
        <section aria-label="KPIs del día">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard
              label="Ventas hoy"
              value={kpis.ventasHoy}
              format="currency"
              icon={FileText}
              variant={kpis.ventasHoy > 0 ? 'default' : 'default'}
            />
            <KpiCard
              label="Tickets hoy"
              value={kpis.ticketsHoy}
              format="number"
              icon={Ticket}
              footer={`Promedio ${kpis.ticketPromedio > 0 ? '$' + Math.round(kpis.ticketPromedio).toLocaleString('es-AR') : '—'}`}
            />
            <KpiCard
              label="Empleados activos"
              value={kpis.empleadosActivos}
              format="number"
              icon={Users}
            />
            <KpiCard
              label="Alertas críticas"
              value={kpis.alertasCriticas}
              format="number"
              icon={AlertTriangle}
              variant={kpis.alertasCriticas > 0 ? 'danger' : 'default'}
            />
          </div>
        </section>
      )}

      <QuickActions />

      {esTransversal && <SucursalesLive />}

      {esTransversal && <NoraPrediccionesPanel />}
    </div>
  )
}
