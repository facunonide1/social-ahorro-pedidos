import { FileText, Ticket, Users, AlertTriangle, TrendingUp, Wallet, Scale, Landmark, Tag, Clock } from 'lucide-react'

import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { getSucursalActiva } from '@/lib/sucursal/server'
import { ROLES_TRANSVERSALES, ADMIN_ROLE_LABELS, type AdminRole } from '@/lib/types/admin'
import { saludoHora } from '@/lib/utils/saludo'
import { createAdminClient } from '@/lib/supabase/server'
import { KpiCard } from '@/components/cards/kpi-card'

import { CentroDatosMCCard } from '@/components/centro-datos/centro-datos-mc-card'
import { NoraFeedCard } from '@/components/nora/nora-feed-card'
import { IrregularidadesMCCard } from '@/components/operaciones/irregularidades-mc-card'
import { RecomendacionesComprasCard } from '@/components/compras/recomendaciones-card'
import { ClientesMCCard } from '@/components/crm/clientes-mc-card'
import { NoraBriefingCard } from './nora-briefing-card'
import { NoraPrediccionesPanel } from './nora-predicciones-panel'
import { SucursalesLive } from './sucursales-live'
import { OsAccionesRapidas } from './os-acciones-rapidas'
import { OsSubAppsGrid } from './os-subapps-grid'
import { OsLoUrgente, type UrgenteItem } from './os-lo-urgente'
import { puede, type PermisosCustom } from '@/lib/types/permisos'

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
 * Zona 3 · "Lo urgente": lista transversal de lo crítico ya calculable, gateada
 * por permisos del usuario y por la sucursal activa. Contadores baratos sobre
 * tablas existentes; una fuente que falle simplemente no aporta ítem.
 */
async function getLoUrgente(rol: AdminRole, custom: PermisosCustom | null): Promise<UrgenteItem[]> {
  const adm = createAdminClient()
  const ahora = new Date().toISOString()
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date())
  const en30 = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(Date.now() + 30 * 86_400_000))
  const { sucursalId, esTodas } = getSucursalActiva()
  const scope = <T,>(q: T): T => (esTodas || !sucursalId ? q : (q as any).eq('sucursal_id', sucursalId))
  const ve = (m: Parameters<typeof puede>[2]) => rol === 'super_admin' || puede(rol, custom, m, 'ver')

  const nulo = Promise.resolve({ count: 0 } as any)
  const [tv, vp, dv, fn, na, rc] = await Promise.all([
    ve('tareas') ? scope(adm.from('tareas').select('id', { count: 'exact', head: true }).lt('fecha_vencimiento', ahora).in('estado', ['pendiente', 'asignada', 'reclamada', 'en_progreso', 'en_verificacion'])) : nulo,
    ve('operaciones') ? scope(adm.from('vencimientos').select('id', { count: 'exact', head: true }).eq('estado', 'vigente').lte('fecha_vencimiento', en30)) : nulo,
    ve('finanzas') ? scope(adm.from('facturas_proveedor').select('id', { count: 'exact', head: true }).lt('fecha_vencimiento', hoy).in('estado', ['pendiente_aprobacion', 'aprobada', 'programada_pago', 'pagada_parcial', 'vencida'])) : nulo,
    ve('compras') ? scope(adm.from('avisos_faltante').select('id', { count: 'exact', head: true }).eq('estado', 'nuevo')) : nulo,
    ve('ia') ? adm.from('nora_avisos').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente') : nulo,
    ve('compras') ? adm.from('devoluciones_proveedor').select('id', { count: 'exact', head: true }).eq('estado', 'enviada').not('proximo_recordatorio_at', 'is', null).lte('proximo_recordatorio_at', ahora) : nulo,
  ])

  const items: UrgenteItem[] = []
  const push = (cond: boolean, count: number, it: Omit<UrgenteItem, 'id'>) => { if (cond && count > 0) items.push({ id: it.ruta, ...it }) }
  push(ve('tareas'), tv.count ?? 0, { icono: 'ListChecks', acento: '#2EE1A8', origen: 'Tareas', texto: `${tv.count} tareas vencidas o en verificación`, ruta: '/admin/tareas', severidad: 'danger' })
  push(ve('finanzas'), dv.count ?? 0, { icono: 'Wallet', acento: '#10B981', origen: 'Finanzas', texto: `${dv.count} documentos a pagar vencidos`, ruta: '/admin/finanzas/documentos', severidad: 'danger' })
  push(ve('operaciones'), vp.count ?? 0, { icono: 'Boxes', acento: '#6E3CDB', origen: 'Stock', texto: `${vp.count} productos vencen en 30 días`, ruta: '/admin/operaciones/vencimientos', severidad: 'warn' })
  push(ve('compras'), fn.count ?? 0, { icono: 'ShoppingCart', acento: '#F59E0B', origen: 'Compras', texto: `${fn.count} faltantes por comprar`, ruta: '/admin/compras/faltantes', severidad: 'warn' })
  push(ve('compras'), rc.count ?? 0, { icono: 'Undo2', acento: '#F59E0B', origen: 'Compras', texto: `${rc.count} reclamo(s) a proveedor sin nota de crédito`, ruta: '/admin/compras/devoluciones', severidad: 'danger' })

  // Caja: cajeros con ≥3 arqueos observados en 30 días (OS-4b · B).
  if (ve('caja') || ve('finanzas')) {
    try {
      const desde30 = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(Date.now() - 30 * 86_400_000))
      let cq = adm.from('arqueos_caja').select('cajero_nombre').eq('estado', 'observada').gte('fecha', desde30).limit(1000)
      if (!esTodas && sucursalId) cq = cq.eq('sucursal_id', sucursalId)
      const { data: obs } = await cq
      const m = new Map<string, number>()
      for (const a of (obs ?? []) as any[]) if (a.cajero_nombre) m.set(a.cajero_nombre, (m.get(a.cajero_nombre) ?? 0) + 1)
      const conPatron = [...m.values()].filter((n) => n >= 3).length
      push(true, conPatron, { icono: 'Wallet', acento: '#10B981', origen: 'Caja', texto: `${conPatron} cajero(s) con descuadres repetidos (30d)`, ruta: '/admin/finanzas/caja/historico', severidad: 'danger' })
    } catch { /* */ }
  }
  push(ve('ia'), na.count ?? 0, { icono: 'Sparkles', acento: '#A855F7', origen: 'NORA', texto: `${na.count} avisos de NORA sin revisar`, ruta: '/admin/nora/feed', severidad: 'info' })
  return items
}

/**
 * Mission Control (NORA OS) — home en 5 zonas: saludo NORA · acciones rápidas ·
 * lo urgente · grilla de sub-apps · KPIs + sucursales en vivo (roles altos).
 * Todo filtrado por rol/permisos y tolerante a datos vacíos.
 */
export default async function MissionControlPage() {
  const profile = await requireAdminHubAccess()

  const { data: fila } = await createAdminClient()
    .from('users_admin')
    .select('permisos_custom')
    .eq('id', profile.id)
    .maybeSingle<{ permisos_custom: PermisosCustom | null }>()
  const custom = fila?.permisos_custom ?? null

  const esTransversal = ROLES_TRANSVERSALES.includes(profile.rol)
  const { sucursalId, esTodas } = getSucursalActiva()
  const fecha = new Date().toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  const [kpis, gerencial, urgente] = await Promise.all([
    esTransversal ? getKpis() : Promise.resolve(null),
    esTransversal ? getResumenGerencial() : Promise.resolve(null),
    getLoUrgente(profile.rol, custom),
  ])

  return (
    <div className="container mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-6 md:py-8">
      {/* Zona 1 · Saludo NORA */}
      <header>
        <div className="text-[11px] font-medium uppercase tracking-[0.5px] text-muted-foreground">
          Mission Control · {fecha}
        </div>
        <h1 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">
          {saludoHora(profile.nombre, profile.email)}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {ADMIN_ROLE_LABELS[profile.rol]} · NORA OS
        </p>
      </header>

      <NoraBriefingCard />

      {/* Zona 2 · Acciones rápidas (por rol) */}
      <OsAccionesRapidas />

      {/* Zona 3 · Lo urgente (transversal) */}
      <OsLoUrgente items={urgente} />

      {/* Zona 4 · Grilla de sub-apps (permitidas) */}
      <OsSubAppsGrid />

      {/* Zona 5 · KPIs + resumen (roles altos) */}
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

      {esTransversal && <NoraFeedCard />}

      {esTransversal && <IrregularidadesMCCard sucursalId={sucursalId} esTodas={esTodas} />}

      {esTransversal && <SucursalesLive />}

      {esTransversal && <CentroDatosMCCard />}

      {esTransversal && <RecomendacionesComprasCard sucursalId={sucursalId} esTodas={esTodas} compact />}

      {esTransversal && <ClientesMCCard />}

      {esTransversal && <NoraPrediccionesPanel />}
    </div>
  )
}
