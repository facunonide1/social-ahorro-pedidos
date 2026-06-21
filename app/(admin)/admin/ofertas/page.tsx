import Link from 'next/link'
import { Tag, Clock, CheckSquare, TrendingUp, ArrowRight, CalendarDays, Sparkles, BarChart3, Users } from 'lucide-react'

import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'
import { AccesoCentroDatos } from '@/components/centro-datos/acceso-centro-datos'
import { KpiCard } from '@/components/cards/kpi-card'
import { NoraCard } from '@/components/nora/nora-card'
import { OfertasClient, type OfertaRow, type ProdLite, type CampLite } from './ofertas-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Ofertas' }

const ACTIVAS = ['aprobada', 'activa']

export default async function OfertasPage() {
  const profile = await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'comprador', 'administrativo', 'auditor'] })
  const sb = createClient()

  const [{ data: ofertas }, { data: confs }, { data: prods }, { data: camps }] = await Promise.all([
    sb.from('ofertas').select('id, codigo, nombre, tipo, valor, productos_ids, rubro, canales, vigencia_tipo, fecha_inicio, fecha_fin, origen, estado, propuesta_por, publicada_cuponera, version, metricas, created_at').order('created_at', { ascending: false }).limit(1000),
    sb.from('ofertas_confirmaciones').select('oferta_id, version_confirmada'),
    sb.from('productos_catalogo').select('id, sku, nombre, precio_sugerido, precio_costo_promedio').eq('activo', true).order('nombre').limit(5000),
    sb.from('campanias').select('id, nombre, estado').order('created_at', { ascending: false }).limit(200),
  ])

  const rows = (ofertas ?? []) as any[]
  const activas = rows.filter((o) => ACTIVAS.includes(o.estado)).length
  const pendientes = rows.filter((o) => o.estado === 'pendiente_aprobacion').length
  const confList = (confs ?? []) as any[]
  const totalConf = confList.length
  const confirmadas = confList.filter((c) => c.version_confirmada > 0).length
  const pctConf = totalConf > 0 ? Math.round((confirmadas / totalConf) * 100) : 0
  const inicioMes = new Date().toISOString().slice(0, 7) + '-01'
  const upliftMes = rows.filter((o) => o.estado === 'finalizada' && o.created_at >= inicioMes).reduce((a, o) => a + Number(o.metricas?.uplift_pct ?? 0), 0)

  const ofertaRows: OfertaRow[] = rows.map((o) => ({
    id: o.id, codigo: o.codigo, nombre: o.nombre, tipo: o.tipo, valor: o.valor != null ? Number(o.valor) : null,
    nProductos: (o.productos_ids ?? []).length, rubro: o.rubro, canales: o.canales ?? [],
    vigenciaTipo: o.vigencia_tipo, fechaInicio: o.fecha_inicio, fechaFin: o.fecha_fin, origen: o.origen,
    estado: o.estado, propuestaPor: o.propuesta_por, publicadaCuponera: o.publicada_cuponera,
  }))

  return (
    <>
      <PageHeader title="Ofertas" description="Objeto vivo: se carga o la propone NORA → se aprueba → dispara tareas, publica y notifica al equipo."
        breadcrumbs={[{ label: 'Comercial' }, { label: 'Ofertas' }]}
        actions={<AccesoCentroDatos accion={{ tipo: 'exportar-ofertas' }} />} />
      <div className="space-y-5 p-4 md:p-6">
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label="Ofertas activas" value={activas} icon={Tag} />
          <KpiCard label="Pendientes de aprobación" value={pendientes} icon={Clock} variant={pendientes > 0 ? 'warning' : 'default'} />
          <KpiCard label="Lectura del equipo" value={pctConf} format="percent" icon={CheckSquare} />
          <KpiCard label="Uplift del mes" value={upliftMes} format="percent" icon={TrendingUp} href="/admin/ofertas/rendimiento" />
        </section>

        <NoraCard contexto="ofertas">
          {pendientes > 0
            ? <p>Tenés <b>{pendientes}</b> ofertas esperando aprobación. Al aprobarlas se disparan las tareas (cartel, góndola), se publica a los canales y se avisa al equipo.</p>
            : <p>Revisá las <Link href="/admin/ofertas/propuestas" className="text-primary hover:underline">propuestas de NORA</Link>: liquidaciones de productos por vencer y combos imán+dormido listos para aprobar.</p>}
        </NoraCard>

        <section>
          <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Secciones</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
            {[
              { l: 'Calendario', h: '/admin/ofertas/calendario', i: CalendarDays },
              { l: 'Propuestas de NORA', h: '/admin/ofertas/propuestas', i: Sparkles },
              { l: 'Rendimiento', h: '/admin/ofertas/rendimiento', i: BarChart3 },
              { l: 'Panel del equipo', h: '/admin/ofertas/panel', i: Users },
            ].map((a) => (
              <Link key={a.h} href={a.h} className="group flex flex-col gap-2 rounded-xl border border-border bg-card p-4 transition-all hover:scale-[1.02] hover:border-primary/50 hover:shadow-md">
                <div className="flex items-center justify-between"><a.i className="size-5 text-primary" /><ArrowRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" /></div>
                <div className="text-sm font-medium">{a.l}</div>
              </Link>
            ))}
          </div>
        </section>

        <OfertasClient
          ofertas={ofertaRows} rol={profile.rol}
          productos={((prods ?? []) as any[]).map((p) => ({ id: p.id, sku: p.sku, nombre: p.nombre, precio: Number(p.precio_sugerido ?? 0), costo: Number(p.precio_costo_promedio ?? 0) })) as ProdLite[]}
          campanias={((camps ?? []) as any[]).map((c) => ({ id: c.id, nombre: c.nombre, estado: c.estado })) as CampLite[]}
        />
      </div>
    </>
  )
}
