import { FileText, Ticket, Users, AlertTriangle, TrendingUp, Wallet, Scale, Landmark, Tag, Clock } from 'lucide-react'

import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { getSucursalActiva } from '@/lib/sucursal/server'
import { ROLES_TRANSVERSALES, ADMIN_ROLE_LABELS } from '@/lib/types/admin'
import { saludoHora } from '@/lib/utils/saludo'
import { createAdminClient } from '@/lib/supabase/server'
import { KpiCard } from '@/components/cards/kpi-card'

import { CentroDatosMCCard } from '@/components/centro-datos/centro-datos-mc-card'
import { RecomendacionesComprasCard } from '@/components/compras/recomendaciones-card'
import { ClientesMCCard } from '@/components/crm/clientes-mc-card'
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
  const { sucursalId, esTodas } = getSucursalActiva()
  const scope = <T,>(q: T): T => (esTodas || !sucursalId ? q : (q as any).eq('sucursal_id', sucursalId))

  const [ordersRes, empRes, tareasRes, stockRes] = await Promise.all([
    adm.from('orders').select('total').gte('created_at', inicioHoy),
    scope(adm.from('empleados').select('id', { count: 'exact', head: true }).eq('activo', true)),
    scope(adm
      .from('tareas')
      .select('id', { count: 'exact', head: true })
      .lt('fecha_vencimiento', ahora)
      .in('estado', ['pendiente', 'asignada', 'en_progreso', 'en_verificacion'])),
    scope(adm.from('stock_items').select('cantidad, stock_minimo').gt('stock_minimo', 0).limit(5000)),
  ])

  const ordenes = (ordersRes.data ?? []) as { total: number | null }[]
  const ventasHoy = ordenes.reduce((a, o) => a + Number(o.total ?? 0), 0)
  const ticketsHoy = ordenes.length
  const ticketPromedio = ticketsHoy > 0 ? ventasHoy / ticketsHoy : 0
  const empleadosActivos = empRes.count ?? 0
  const stockCritico = ((stockRes.data ?? []) as { cantidad: number; stock_minimo: number }[]).filter(
    (s) => Number(s.cantidad) <= Number(s.stock_minimo),
  ).length
  const alertasCriticas = (tareasRes.count ?? 0) + stockCritico

  return { ventasHoy, ticketsHoy, ticketPromedio, empleadosActivos, alertasCriticas }
}

type ResumenGerencial = {
  ventasMes: number
  gastoMes: number
  margenMes: number
  saldoBancarioARS: number
  faltantes: number
  ordenesAbiertas: number
  ofertasActivas: number
  ofertasPendientes: number
  urgentes7d: number
}

const OC_ABIERTAS = ['borrador', 'enviada', 'confirmada', 'recibida_parcial']

/**
 * Resumen gerencial (absorbido del ex /admin/ejecutivo) — solo roles
 * transversales. Vistazo de 30s a nivel dirección. Tolerante a tablas vacías.
 */
async function getResumenGerencial(): Promise<ResumenGerencial> {
  const adm = createAdminClient()
  const d30 = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const mesActual = new Date().toISOString().slice(0, 7)
  const { sucursalId, esTodas } = getSucursalActiva()
  const scope = <T,>(q: T, col = 'sucursal_id'): T => (esTodas || !sucursalId ? q : (q as any).eq(col, sucursalId))

  const [ventasRes, gastosRes, cuentasRes, faltRes, ocRes, ofeActRes, ofePendRes, urgRes] = await Promise.all([
    adm.from('orders').select('total, status').gte('created_at', d30),
    scope(adm.from('gastos_operativos').select('monto').eq('periodo', mesActual)),
    adm.from('cuentas_bancarias_con_saldo').select('moneda, saldo_actual, activa'),
    scope(adm.from('avisos_faltante').select('id', { count: 'exact', head: true }).eq('estado', 'nuevo')),
    scope(adm.from('ordenes_compra').select('id', { count: 'exact', head: true }).in('estado', OC_ABIERTAS), 'sucursal_compradora_id'),
    adm.from('ofertas').select('id', { count: 'exact', head: true }).eq('estado', 'activa'),
    adm.from('ofertas').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente_aprobacion'),
    adm.from('mensajes').select('id', { count: 'exact', head: true }).eq('es_urgente', true).gte('created_at', new Date(Date.now() - 7 * 86_400_000).toISOString()),
  ])

  const ventasMes = ((ventasRes.data ?? []) as any[])
    .filter((o) => o.status !== 'cancelado')
    .reduce((a, o) => a + Number(o.total || 0), 0)
  const gastoMes = ((gastosRes.data ?? []) as any[]).reduce((a, g) => a + Number(g.monto || 0), 0)
  const saldoBancarioARS = ((cuentasRes.data ?? []) as any[])
    .filter((c) => c.activa && c.moneda === 'ARS')
    .reduce((a, c) => a + Number(c.saldo_actual || 0), 0)

  return { ventasMes, gastoMes, margenMes: ventasMes - gastoMes, saldoBancarioARS, faltantes: faltRes.count ?? 0, ordenesAbiertas: ocRes.count ?? 0, ofertasActivas: ofeActRes.count ?? 0, ofertasPendientes: ofePendRes.count ?? 0, urgentes7d: urgRes.count ?? 0 }
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
  const { sucursalId, esTodas } = getSucursalActiva()
  const fecha = new Date().toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  const kpis = esTransversal ? await getKpis() : null
  const gerencial = esTransversal ? await getResumenGerencial() : null

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

      {gerencial && (
        <section aria-label="Resumen gerencial">
          <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Resumen gerencial
          </h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="Ventas 30 días" value={gerencial.ventasMes} format="currency" icon={TrendingUp} />
            <KpiCard label="Gasto del mes" value={gerencial.gastoMes} format="currency" icon={Wallet} />
            <KpiCard
              label="Margen del mes"
              value={gerencial.margenMes}
              format="currency"
              icon={Scale}
              variant={gerencial.margenMes < 0 ? 'danger' : 'success'}
            />
            <KpiCard
              label="Saldo bancario ARS"
              value={gerencial.saldoBancarioARS}
              format="currency"
              icon={Landmark}
              variant={gerencial.saldoBancarioARS < 0 ? 'danger' : 'default'}
              href="/admin/finanzas/cuentas"
            />
            <KpiCard
              label="Faltantes a comprar"
              value={gerencial.faltantes}
              icon={AlertTriangle}
              variant={gerencial.faltantes > 0 ? 'warning' : 'default'}
              href="/admin/compras/faltantes"
            />
            <KpiCard
              label="Órdenes de compra abiertas"
              value={gerencial.ordenesAbiertas}
              icon={FileText}
              href="/admin/compras/ordenes"
            />
            <KpiCard
              label="Ofertas activas"
              value={gerencial.ofertasActivas}
              icon={Tag}
              href="/admin/ofertas"
            />
            <KpiCard
              label="Ofertas a aprobar"
              value={gerencial.ofertasPendientes}
              icon={Clock}
              variant={gerencial.ofertasPendientes > 0 ? 'warning' : 'default'}
              href="/admin/ofertas"
            />
            <KpiCard
              label="Mensajes urgentes (7d)"
              value={gerencial.urgentes7d}
              icon={AlertTriangle}
              variant={gerencial.urgentes7d > 0 ? 'danger' : 'default'}
              href="/admin/comunicacion"
            />
          </div>
        </section>
      )}

      <QuickActions />

      {esTransversal && <SucursalesLive />}

      {esTransversal && <CentroDatosMCCard />}

      {esTransversal && <RecomendacionesComprasCard sucursalId={sucursalId} esTodas={esTodas} compact />}

      {esTransversal && <ClientesMCCard />}

      {esTransversal && <NoraPrediccionesPanel />}
    </div>
  )
}
